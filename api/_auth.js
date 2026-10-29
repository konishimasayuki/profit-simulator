// APP_PASSCODE が設定されている場合のみパスコード必須
export function checkAuth(req) {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return true;
  return req.headers["x-passcode"] === pass;
}
