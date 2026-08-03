import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;

export function isNewerVersion(latest: string, current: string): boolean {
  const toParts = (v: string) => {
    const clean = v.replace(/^v/, "");
    const [base = "0", pre = ""] = clean.split("-");
    const nums = base.split(".").map((n) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre };
  };

  const l = toParts(latest);
  const c = toParts(current);
  for (let i = 0; i < 3; i++) {
    if (l.nums[i] !== c.nums[i]) return l.nums[i] > c.nums[i];
  }

  if (l.pre === c.pre) return false;
  if (!l.pre) return true;
  if (!c.pre) return false;
  return l.pre > c.pre;
}
