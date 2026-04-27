import { Service } from "typedi";
import { resend } from "@/config/resend-config";
import { APIError } from "@/utils/error-handler";
import { STATUS } from "@/constants/status.constant";

@Service()
export class NotificationService {
    async toggleEmailNotification(email: string){
        const customer = await resend.contacts.get({email});
        if(!customer.data){
            throw new APIError("Please complete onboarding to manage email notifications.", STATUS.conflict);
        }
        const {error} = await resend.contacts.update({
            email,
            unsubscribed: !customer.data?.unsubscribed
        })
        if(error){
            throw new APIError("Unable to update email notifications. Please try again later.", STATUS.bad);
        }
        return {
            message: !customer.data?.unsubscribed == true? "Unsubscription successful": "Subscription successfully",
            payload: null
        }
    }
}