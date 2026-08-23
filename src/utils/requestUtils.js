const getIpAddress = (req) => {
  let ip =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;

  if (ip === "::1") {
    return "127.0.0.1";
  }

  if (ip?.startsWith("::ffff:")) {
    return ip.substring(7);
  }

  return ip;
};

const getUserId = (req) => {
  const id = req.user?.id ?? req.user?.userId ?? null;

  if (!id) return null;

  const parsed = Number(id);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
};
module.exports = {
  getIpAddress,
  getUserId
};
