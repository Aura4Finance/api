import { Resend } from "resend";
export const resend = new Resend(process.env.RESEND_API_KEY);

export const segments = {
    waitlist: {
        id: 'de8828fc-4b97-488c-93c1-9dabbb96e158',
        name: 'Waitlist Segment'
    },
    customer: {
        id: 'abc9706a-4dbe-420a-b6ee-19eb6d1b587e',
        name: 'Customer Segment'
    },
    merchant: {
        id: "de8828fc-4b97-488c-93c1-9dabbb96e158",
        name: "Merchant Segment"
    }
}
