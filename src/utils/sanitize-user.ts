export default function sanitizeUser(profile: any) {
  const { password, disabled, role, businessProfile, googleId, ...rest } = profile;
  const sanitized = { ...rest };
  if (businessProfile) {
    const { webhook, ...bpRest } = businessProfile;
    sanitized.businessProfile = bpRest;
  }
  return sanitized;
}
