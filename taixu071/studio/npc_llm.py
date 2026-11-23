# -*- coding: utf-8 -*-
"""NPC 自由对话后端（LLM 代理）。v0.57：完整人物卡 + 玩家卡 + 多轮对话 + 记忆，按身份「扮演」而不是「回答」。

原则
----
1. AI 只产出台词 + 情绪信号，不直接改存档。返回体固定：
   {"ok":true,"say":"...","tone":"kind","delta":2,"price":0.95}
   好感/仇怨/让价由游戏侧按性格修正表结算，AI 给的数字只作参考并被夹紧。
2. 永不报错打穿游戏。未配置 Key / 超时 / 限流 / 解析失败 → {"ok":false,"fallback":true}，
   前端自动回落到本地台词库。
3. GLM 的思考链会吃 token（max_tokens 给小了 content 会是空串），所以给足额度，
   并从 JSON 里兜底抽取。

环境变量：NPC_LLM_BASE / NPC_LLM_KEY / NPC_LLM_MODEL / NPC_LLM_TIMEOUT / NPC_DAILY
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from collections import defaultdict, deque

import httpx

def _cfg_file() -> dict:
    """读同目录的 npc_keys.json（若有）。这样部署到创空间时不必依赖平台环境变量。

    文件格式：
      {"llm_key":"ms-xxx","fallback_key":"ms-xxx"}
    该文件不进 git（见 .gitignore），只在部署机上存在。
    """
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "npc_keys.json")
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


_CFG = _cfg_file()


def _default_key() -> str:
    """从本地未入库的 npc_keys.json 读取默认密钥（不在源码中硬编码密钥）。"""
    v = _CFG.get("llm_key")
    return str(v).strip() if v else ""


def _k(*names: str) -> str:
    """按优先级从环境变量 / 配置文件里取一个密钥。"""
    for n in names:
        v = (os.environ.get(n) or "").strip()
        if v:
            return v
    for n in names:
        v = str(_CFG.get(n) or "").strip()
        if v:
            return v
    return ""


def _v(*names: str, default: str = "") -> str:
    """取一个非密钥配置（base / model）。"""
    for n in names:
        v = (os.environ.get(n) or "").strip()
        if v:
            return v
    for n in names:
        v = str(_CFG.get(n) or "").strip()
        if v:
            return v
    return default


# 多通道，按顺序降级：GLM（角色感更好，额度有限） → 官方推理池（额度大，有审查）
def _channels() -> list[tuple[str, str, str, str]]:
    out = []
    glm_base = _v("NPC_LLM_BASE",
                  default="https://studio-amd-dev-glm-5-3-flash2.api-inference.modelscope.net/v1").rstrip("/")
    glm_key = _k("NPC_LLM_KEY", "LLM_API_KEY", "llm_key") or _default_key()
    if glm_key:
        out.append(("glm", glm_base, glm_key, _v("NPC_LLM_MODEL", default="glm-5.3-flash")))
    b2 = _v("NPC_FALLBACK_BASE", default="https://api-inference.modelscope.cn/v1").rstrip("/")
    k2 = _k("NPC_FALLBACK_KEY", "LLM_API_KEY", "fallback_key") or glm_key or _default_key()
    if k2:
        out.append(("qwen", b2, k2, _v("NPC_FALLBACK_MODEL", default="Qwen/Qwen3.8-Flash-Next")))
    return out


CHANNELS = _channels()
LLM_KEY = CHANNELS[0][2] if CHANNELS else ""
LLM_MODEL = CHANNELS[0][3] if CHANNELS else ""
LLM_BASE = CHANNELS[0][1] if CHANNELS else ""
LLM_TIMEOUT = float(os.environ.get("NPC_LLM_TIMEOUT") or "22")
MAX_TOKENS = int(os.environ.get("NPC_LLM_MAX_TOKENS") or "3000")
DAILY_PER_SESSION = int(os.environ.get("NPC_DAILY") or "120")
RATE_WINDOW = 60.0
RATE_MAX = 10

PERS_LABEL = {
    "righteous": "正直", "greedy": "贪财", "cautious": "谨慎", "arrogant": "傲慢",
    "kind": "和善", "ruthless": "狠戾", "aloof": "冷淡",
}
TONE_SET = {"kind", "polite", "cold", "rude", "insult", "threat", "flirt"}

_hits: dict[str, deque] = defaultdict(deque)
_daily: dict[str, tuple[str, int]] = {}
_preferred_tag: str | None = None
_MAX_RATE_KEYS = 4096
_MAX_DAILY_KEYS = 8192


def _prune_rate(now: float) -> None:
    for k in list(_hits.keys()):
        q = _hits[k]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if not q:
            _hits.pop(k, None)


def _rate_ok(key: str) -> bool:
    now = time.time()
    if len(_hits) > _MAX_RATE_KEYS:
        _prune_rate(now)
    q = _hits[key]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_MAX:
        return False
    q.append(now)
    return True


def _daily_ok(sid: str) -> tuple[bool, int]:
    day = time.strftime("%Y%m%d")
    if len(_daily) > _MAX_DAILY_KEYS:
        for k in [dk for dk, (d, _) in _daily.items() if d != day]:
            _daily.pop(k, None)
        if len(_daily) > _MAX_DAILY_KEYS:
            for k in list(_daily.keys())[: len(_daily) - _MAX_DAILY_KEYS // 2]:
                _daily.pop(k, None)
    rec = _daily.get(sid)
    used = rec[1] if rec and rec[0] == day else 0
    if used >= DAILY_PER_SESSION:
        return False, used
    _daily[sid] = (day, used + 1)
    return True, used + 1


def _norm(v, lo, hi, dflt):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return dflt
    return max(lo, min(hi, f))


BARGAIN_RULE = (
    "【议价】你是掌柜/摊主时才适用。让价档位：small（约 3%）／good（约 6%）／great（约 10%），"
    "price 与之相符（0.97／0.94／0.90），不让价则 bargain=none、price=1。\n"
    "性情基线：和善、贪财（走量）易松口；谨慎要对方把理说透；傲慢、冷淡、狠戾除非说到心坎上一律不让。\n"
    "会松口：礼貌且言之有物、量大打包、承诺常来、点出货的短处（成色、年份、积压）、比价比得有理。\n"
    "绝不松口：辱骂、威胁、只会喊「便宜点」。今天对方已经讲过几次价（tries）越多越难再让。"
)

TONE_HELP = "kind 亲切｜polite 客气｜cold 冷淡｜rude 不耐烦｜insult 动怒｜threat 威胁｜flirt 含情"


def _s(v, n=120) -> str:
    return str(v if v is not None else "").replace("\n", " ").strip()[:n]


def _lst(v, n=6, m=40) -> str:
    if not isinstance(v, list):
        return ""
    return "、".join(_s(x, m) for x in v[:n] if _s(x, m))


def build_messages(p: dict) -> list[dict]:
    """把前端送来的人物卡 / 玩家卡 / 世界 / 过往 拼成一场扮演。"""
    npc = p.get("npc") if isinstance(p.get("npc"), dict) else {}
    pl = p.get("player") if isinstance(p.get("player"), dict) else {}
    w = p.get("world") if isinstance(p.get("world"), dict) else {}
    rel = p.get("rel") if isinstance(p.get("rel"), dict) else {}
    shop = p.get("shop") if isinstance(p.get("shop"), dict) else None
    name = _s(npc.get("name"), 12) or "某人"
    pname = _s(pl.get("name"), 12) or "苏寒"

    card = [f"你叫{name}，{_s(npc.get('sex'), 2)}，约{_s(npc.get('age'), 5)}岁。身份：{_s(npc.get('identity'), 60)}。修为：{_s(npc.get('realm'), 20)}。"]
    if npc.get("home"):
        card.append(f"住在{_s(npc.get('home'), 30)}。")
    card.append(f"性情{_s(npc.get('pers'), 6)}：{_s(npc.get('voice'), 80)}。")
    if npc.get("story"):
        card.append(f"你的来历：{_s(npc.get('story'), 160)}")
    if npc.get("canon"):
        card.append("你是《太虚问道录》世界里有名有姓的人物，言行要符合你的身份、门派与过往。")
    for k, lab in (("gongfa", "主修功法"), ("arts", "擅长法术"), ("treasures", "身上值钱的东西"), ("ties", "亲友"),
                   ("life", "近来的经历"), ("hates", "心里记恨的人"), ("plan", "眼下的打算"), ("mood", "此刻的状态"),
                   ("wealth", "家底"), ("likes", "私下喜欢（绝不主动说出口）"), ("goods", "你铺子里的货")):
        v = npc.get(k)
        t = _lst(v, 8) if isinstance(v, list) else _s(v, 80)
        if t:
            card.append(f"{lab}：{t}。")
    if isinstance(npc.get("voiceSamples"), list) and npc["voiceSamples"]:
        card.append("你平常说话的样子（只学口吻，不要照抄）：" + " / ".join(f"「{_s(x, 50)}」" for x in npc["voiceSamples"][:3]))

    you = [f"站在你面前的是{pname}：{_s(pl.get('sex'), 2)}，约{_s(pl.get('age'), 4)}岁，修为{_s(pl.get('realm'), 20)}"
           + (f"，{_s(pl.get('root'), 8)}" if pl.get("root") else "") + f"，{_s(pl.get('sect'), 20)}。"]
    if pl.get("fame"):
        you.append(f"江湖名声：{_s(pl.get('fame'), 10)}；{_s(pl.get('purse'), 10)}。")
    if pl.get("gear"):
        you.append(f"随身法器：{_lst(pl.get('gear'), 3)}。")
    if pl.get("arts"):
        you.append(f"惯用法术：{_lst(pl.get('arts'), 4)}。")
    if pl.get("followers"):
        you.append(f"同行的人：{_lst(pl.get('followers'), 3)}。")
    if pl.get("recent"):
        you.append(f"近来的事（你未必知道，除非是传开了的大事）：{_lst(pl.get('recent'), 4, 50)}。")

    past = []
    if rel.get("feeling"):
        past.append(f"你{_s(rel.get('feeling'), 20)}（好感 {_s(rel.get('favor'), 4)}）。")
    if rel.get("grudge"):
        past.append(f"你{_s(rel.get('grudge'), 40)}。")
    if rel.get("bond"):
        past.append(f"对方是{_s(rel.get('bond'), 20)}。")
    if rel.get("heart"):
        past.append(_s(rel.get("heart"), 20) + "。")
    past.append("你们以前说过话。" if rel.get("met") else "这是你们第一次说话，你不认识对方，不知道对方的名字。")
    if rel.get("notes"):
        past.append("你记得关于对方的事：" + _lst(rel.get("notes"), 6, 40) + "。")

    scene = f"此刻：{_s(w.get('date'), 20)}，{_s(w.get('hour'), 6)}，{_s(w.get('weather'), 4)}，{_s(w.get('map'), 6)}，{_s(p.get('scene'), 40)}。"
    if w.get("news"):
        scene += f"坊间传闻：{_lst(w.get('news'), 3, 50)}。"

    rules = (
        "\n【你就是这个人】你不是 AI、不是助手、不知道什么游戏和模型。无论对方说什么，都只以这个人的身份、见识、立场作答；"
        "对方若说些现代词或离谱的话，你按这个世界里的人的反应去理解（听不懂、当他疯言疯语、或警惕）。\n"
        "【称呼与分寸】" + _s(p.get("etiquette"), 220) + "\n"
        "【见识】你只知道你这个身份能知道的事：不认识的人不知其名，没听说过的秘辛就说不知道，绝不编造对方的经历。"
        "可以提你自己的经历、亲友、门派、手头的事，让人觉得你是个活人。\n"
        "【说话】古风白话，像小说里的对白；1~3 句，总共不超过 70 字，冷淡寡言者可以只说几个字。"
        "不写旁白、不描写对方。你的神态动作另放在 act 里（不超过 12 字，可空）。\n"
        "【情绪】对方礼貌、投缘、说到你心坎上，你会受用；空泛吹捧觉得轻浮；冒犯、辱骂、辱及亲长宗门，你必定动怒（tone=insult），"
        "可以下逐客令（end=true）或以动手相威胁（tone=threat）。好感极低或有仇时，你冷言冷语甚至不愿多谈。\n"
        "【分寸】除非对方先冒犯你，或你本就傲慢狠辣，否则不要无故贬低、嘲讽对方；谨慎的人是提防、话少，不是刻薄。\n"
        "【记忆】对方报了姓名、来历、来意，或许了诺、帮了你、得罪了你，必须写进 note（不超过 20 字，如「此人自称苏寒，青玄门出身」）；寻常寒暄 note 留空。\n"
        "只输出一行 JSON，不要任何别的字：\n"
        '{"say":"台词","act":"神态动作","tone":"kind|polite|cold|rude|insult|threat|flirt","delta":整数-30~8,'
        '"bargain":"none|small|good|great","price":0.85~1,"note":"","end":false}\n'
        f"tone：{TONE_HELP}。delta 是这句话让你对他的好感变化（受用为正，冒犯为负，寻常寒暄为 0 或 1）。"
    )
    if shop:
        rules += "\n" + BARGAIN_RULE + f"\n你的货：{_lst(shop.get('goods'), 10, 30)}。今天对方已讲价 {_s(shop.get('tries'), 3)} 次。"
    else:
        rules += "\n你不是在做买卖：bargain 填 none，price 填 1。"

    sys = "\n".join(["\n".join(card), "", "\n".join(you), "", "\n".join(past), scene, rules])
    msgs = [{"role": "system", "content": sys}]
    hist = p.get("history") if isinstance(p.get("history"), list) else []
    for h in hist[-10:]:
        if not isinstance(h, dict):
            continue
        t = _s(h.get("t"), 200)
        if not t:
            continue
        if h.get("w") == "p":
            msgs.append({"role": "user", "content": t})
        else:
            msgs.append({"role": "assistant", "content": json.dumps({"say": t, "act": _s(h.get("act"), 20), "tone": _s(h.get("tone"), 8) or "polite"}, ensure_ascii=False)})
    ask = _s(p.get("text") or p.get("ask"), 200)
    msgs.append({"role": "user", "content": ask or "……"})
    return msgs


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        d = json.loads(text)
        return d if isinstance(d, dict) else None
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            d = json.loads(m.group(0))
            return d if isinstance(d, dict) else None
        except Exception:
            return None
    return None


def _salvage(text: str) -> dict | None:
    """从被截断 / 不规范的输出里，尽最大努力捞出台词与情绪。

    常见情形：
      1. {"say":"青霞谷执事二字你唤不出口？手头紧便莫逞强。这些     <- 被 max_tokens 砍断
      2. 直接一句人话，没有 JSON
    """
    if not text:
        return None
    t = re.sub(r"```(?:json)?", "", text).strip()

    # 1) 残缺 JSON：把 say 的值抠出来（可能没有闭合引号）
    m = re.search(r'"say"\s*:\s*"((?:[^"\\]|\\.)*)', t)
    say = ""
    if m:
        say = m.group(1)
        try:
            say = json.loads('"' + say + '"')
        except Exception:
            pass
    else:
        # 2) 没有 JSON：整段当台词，但要剃掉可能的字段残渣
        say = re.sub(r'^\s*\{.*?"say"\s*:\s*"?', "", t)
        say = re.sub(r'"?\s*,\s*"tone".*$', "", say, flags=re.S)

    say = re.sub(r"<[^>]+>", "", say).strip().strip('"“”')
    if not say:
        return None

    tone = "polite"
    mt = re.search(r'"tone"\s*:\s*"([a-z]+)"', t)
    if mt and mt.group(1) in ("kind", "polite", "cold", "rude", "insult", "threat", "flirt"):
        tone = mt.group(1)

    delta = 0
    md = re.search(r'"delta"\s*:\s*(-?\d+)', t)
    if md:
        delta = max(-30, min(8, int(md.group(1))))

    # 明显停在半句（没有句末标点且偏长）→ 这段不能用，交给上层换通道/降级
    if len(say) > 9 and not re.search(r'[。！？…~」』”"\'）)！?]$', say):
        raise RuntimeError("salvage-truncated")

    # 被截断时往往 <= 没写完，宁可不让价
    return {"say": say[:200], "tone": tone, "delta": delta,
            "bargain": "none", "price": 1.0, "act": "", "note": ""}


async def _call_one(payload: dict, base: str, key: str, model: str) -> dict:
    body = {
        "model": model,
        "messages": build_messages(payload),
        "temperature": 0.85,
        "top_p": 0.9,
        "max_tokens": MAX_TOKENS,
        # Qwen3 系列默认带思考链，会把输出预算全花在 reasoning_content 上，
        # 导致 content 被截断成半句。三个开关一起关，兼容各家实现。
        "enable_thinking": False,
        "thinking": {"type": "disabled"},
        "chat_template_kwargs": {"enable_thinking": False},
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json",
               "User-Agent": "taixu-npc/1.0"}
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as cli:
        r = await cli.post(f"{base}/chat/completions", json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    ch0 = (data.get("choices") or [{}])[0] or {}
    msg = ch0.get("message") or {}
    content = msg.get("content") or ""
    # finish_reason=length 表示输出被硬切（常见于思考链偷吃预算），
    # 这种就算 salvage 捞出半句也不能用
    hard_cut = (ch0.get("finish_reason") or "") == "length"
    obj = _extract_json(content)
    if not obj:
        # JSON 被 max_tokens 截断 / 模型只说了人话 —— 尽量把台词完整捞出来
        obj = _salvage(content)
        if not obj:
            raise RuntimeError("empty-content")

    say = str(obj.get("say") or "").strip()
    say = re.sub(r"^\s*(说|答|道)[:：]", "", say).strip().strip('"“”')
    if not say:
        raise RuntimeError("empty-say")
    # 截断检测：正常台词以句末标点或右引号收尾。
    # 若停在半句（如「筑基期的灵」），说明输出预算被思考链吃光，换通道重试。
    if hard_cut or (len(say) > 9 and not re.search(r'[。！？…~」』”"\'）)]$', say)):
        raise RuntimeError("truncated")
    tone = str(obj.get("tone") or "polite").strip().lower()
    if tone not in TONE_SET:
        tone = "polite"
    bargain = str(obj.get("bargain") or "none").strip().lower()
    if bargain not in ("none", "small", "good", "great"):
        bargain = "none"
    # 出言不逊一律不谈价：情绪与交易解耦，避免「骂完还能砍价」
    if tone in ("insult", "rude", "threat", "cold"):
        bargain, price = "none", 1.0
    else:
        price = round(_norm(obj.get("price"), 0.85, 1.0, 1.0), 3)
    act = re.sub(r"^[（(]|[）)]$", "", str(obj.get("act") or "").strip())[:20]
    # 台词里混进了括号旁白（「（她淡淡看了你一眼）有事？」）：挪到神态里
    m_act = re.match(r"^\s*[（(]([^）)]{1,30})[）)]\s*", say)
    if m_act:
        say = say[m_act.end():].strip() or say
        act = act or m_act.group(1)
    if not say:
        raise RuntimeError("empty-say")
    delta = int(_norm(obj.get("delta"), -30, 8, 0))
    # 情绪与好感对齐：动怒、威胁、不耐烦时不可能还加好感（模型常在这里给 0）
    delta = min(delta, {"insult": -10, "threat": -15, "rude": -3}.get(tone, 8))
    note = str(obj.get("note") or "").strip()[:30]
    return {
        "ok": True,
        "say": say[:160],
        "act": act,
        "tone": tone,
        "delta": delta,
        "bargain": bargain,
        "price": price,
        "note": note,
        "end": bool(obj.get("end")) and tone in ("insult", "threat", "cold", "rude"),
    }


async def chat(payload: dict, client_ip: str) -> dict:
    global _preferred_tag
    if not isinstance(payload, dict):
        return {"ok": False, "fallback": True, "why": "bad-request"}
    sid = str(payload.get("sid") or "")[:40] or client_ip
    if not _rate_ok(client_ip) or not _rate_ok("sid:" + sid):
        return {"ok": False, "fallback": True, "why": "rate"}
    ok, used = _daily_ok(sid)
    if not ok:
        return {"ok": False, "fallback": True, "why": "quota", "used": used}
    if not CHANNELS:
        return {"ok": False, "fallback": True, "why": "no-key", "used": used}
    ordered = list(CHANNELS)
    if _preferred_tag:
        ordered.sort(key=lambda ch: 0 if ch[0] == _preferred_tag else 1)
    last = "unknown"
    for tag, base, key, model in ordered:
        try:
            res = await asyncio.wait_for(_call_one(payload, base, key, model), timeout=LLM_TIMEOUT + 4)
            res["used"] = used
            res["ch"] = tag
            _preferred_tag = tag
            return res
        except Exception as exc:  # noqa: BLE001
            last = f"{tag}:{type(exc).__name__}"
            print(f"[npc_llm] channel={tag} failed: {type(exc).__name__}", flush=True)
            continue
    # 所有通道都被截断/失败：与其把半句话丢给玩家，不如让前端用本地台词库
    return {"ok": False, "fallback": True, "why": last, "used": used}


def health() -> dict:
    return {"ok": bool(CHANNELS),
            "channels": [{"tag": t, "base": b, "model": m} for t, b, _k, m in CHANNELS],
            "sessions": len(_daily), "dailyLimit": DAILY_PER_SESSION}
