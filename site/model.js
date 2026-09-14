export function hasAccess(subscription, now = new Date()) {
  return Boolean(subscription && ["trialing", "active"].includes(subscription.status) &&
    new Date(subscription.access_ends_at) > now);
}

export function firstName(profile, user) {
  const name = profile?.full_name || user?.email?.split("@")[0] || "Amigo";
  return String(name).trim().split(/\s+/)[0] || "Amigo";
}

export function progress(done, lessons) {
  return lessons.length ? Math.round(done.length / lessons.length * 100) : 0;
}
