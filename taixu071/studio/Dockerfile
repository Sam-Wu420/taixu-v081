FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

# NPC 对话用的模型通道（服务端出站调用；密钥有默认值，也可用创空间「密钥」功能注入 NPC_LLM_KEY 覆盖；不下发到浏览器）
ENV NPC_LLM_BASE=https://studio-amd-dev-glm-5-3-flash2.api-inference.modelscope.net/v1 \
    NPC_LLM_MODEL=glm-5.3-flash \
    NPC_FALLBACK_BASE=https://api-inference.modelscope.cn/v1 \
    NPC_FALLBACK_MODEL=Qwen/Qwen3.8-Flash-Next

# 启动前把文本资源压成 .gz（app.py 启动时也会补，这里先做掉，省启动时间）
RUN python -c "\
import gzip,os;\
[open(os.path.join(r,f)+'.gz','wb').write(gzip.compress(open(os.path.join(r,f),'rb').read(),6)) \
 for d in ['assets','.'] for r,_,fs in [next(os.walk(d))] for f in fs if f.endswith(('.js','.html','.css','.json'))]"

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "warning"]
