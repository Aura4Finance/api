export default function sanitizeUser(profile: any) {
  const { password, derivationIndex, disabled, role, businessProfile, googleId, twoFactorSecret, ...rest } = profile;
  const sanitized = { ...rest };

  if (businessProfile) {
    const { webhook, wallet, ...bpRest } = businessProfile;

    // Map through the wallet array to keep only the address of each object
    const sanitizedWallet = Array.isArray(wallet) 
      ? wallet.map(({ address }) => ({ address }))
      : [];

    sanitized.businessProfile = {
      ...bpRest,
      wallet: sanitizedWallet
    };
  }

  return sanitized;
}