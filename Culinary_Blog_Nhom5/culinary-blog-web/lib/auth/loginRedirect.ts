export function getLoginRedirect(
  roles: readonly string[] | undefined,
  callbackUrl: string,
  hasExplicitCallback: boolean,
) {
  const isAdmin = roles?.includes("Admin") === true;

  return hasExplicitCallback ? callbackUrl : isAdmin ? "/dashboard" : "/";
}
