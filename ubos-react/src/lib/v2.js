// The CRM V2 surface is intentionally available only under /v2. It uses
// the same application shell and authentication as the normal CRM, while
// its data screen calls the isolated Workflow-V2 API exclusively.
export const CRM_V2_BASENAME = '/v2';

export const IS_CRM_V2 = typeof window !== 'undefined'
  && (window.location.pathname === CRM_V2_BASENAME
    || window.location.pathname.startsWith(`${CRM_V2_BASENAME}/`));
