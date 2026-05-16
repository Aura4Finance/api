const WEBHOOK_EVENT = [
  {
    name: "Payment Success",
    type: "payment.success",
  },
  {
    name: "Payment Failed",
    type: "payment.failed",
  },
  {
    name: "Payment Created",
    type: "payment.create",
  },
  {
    name: "Subscription Created",
    type: "subscription.create",
  },
  {
    name: "Subscription Will Not Renew",
    type: "subscription.not_renew",
  },
  {
    name: "Subscription Disabled",
    type: "subscription.disable",
  },
];

export default WEBHOOK_EVENT;
