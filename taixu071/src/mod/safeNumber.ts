/** Accept numbers and numeric strings from hooks, without invoking object coercion. */
export function hookNumber(value:unknown):number|null {
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
