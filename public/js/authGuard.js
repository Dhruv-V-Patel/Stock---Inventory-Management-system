(() => {
  "use strict";

  const ACCESS_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  const token = localStorage.getItem("accessToken");
  const createdAt = Number(
    localStorage.getItem("accessTokenCreatedAt")
  );

  // No token
  if (!token) {
    window.location.replace("/login");
    return;
  }

  // Token is older than 7 days
  if (
    !createdAt ||
    Date.now() - createdAt >= ACCESS_TOKEN_MAX_AGE
  ) {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("accessTokenCreatedAt");

    window.location.replace("/login");
    return;
  }
})();