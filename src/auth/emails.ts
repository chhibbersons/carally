/** Plain-English email copy for login and invites. */

export function loginEmail(url: string) {
  return {
    subject: "Your DealerReply login link",
    text: `Click the link below to log in to DealerReply. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `<p>Click the button below to log in to DealerReply. It works once and expires in 15 minutes.</p><p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Log in</a></p><p style="color:#666">If you didn't ask for this, you can ignore this email.</p>`,
  };
}

export function inviteEmail(args: { dealerName: string; loginUrl: string }) {
  const { dealerName, loginUrl } = args;
  return {
    subject: `You've been added to DealerReply for ${dealerName}`,
    text: `You now have a DealerReply account for ${dealerName}.\n\nTo log in, open ${loginUrl} and enter this email address. We'll send you a login link.`,
    html: `<p>You now have a DealerReply account for <strong>${escapeHtml(dealerName)}</strong>.</p><p>To log in, open <a href="${loginUrl}">${loginUrl}</a> and enter this email address. We'll send you a login link.</p>`,
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
