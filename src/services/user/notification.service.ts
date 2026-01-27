import { Service } from "typedi";
import { resend } from "@/config/resend-config";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

@Service()
export class NotificationService {
    async toggleEmailNotification(email: string){
        const customer = await resend.contacts.get({email});
        if(!customer.data){
            throw new APIError("Complete onboarding to suscribe for email notification", STATUS.conflict);
        }
        const {error} = await resend.contacts.update({
            email,
            unsubscribed: !customer.data?.unsubscribed
        })
        if(error){
            throw new APIError("Unable to subscribe for email notifications. Try again later", STATUS.bad);
        }
        return {
            message: !customer.data?.unsubscribed == true? "Subscription successful": "Unsuscribed successfully",
            payload: null
        }
    }
}