import { STATUS } from "@/constants/status.constant";
import { CreateWaitlistDto } from "@/dto/waitlist.dto";
import { EmailService } from "@/services/email.service";
import { APIError } from "@/utils/error-handler";
import { formatErrorValidation } from "@/utils/format-validation-error";
import { createWaitlistValidation } from "@/validation/waitlist.validation";
import { resend, segments } from "@/config/resend-config";
import { Response, Request } from "express";
import { Service } from "typedi";

@Service()
export class WaitlistController {
    constructor(private readonly emailService: EmailService) { }

    async addToWaitlist(req: Request, res: Response) {
        const { error, value } = createWaitlistValidation(req.body);
        if (error) {
            return res.status(STATUS.bad).json({
                success: false,
                message: formatErrorValidation(error),
            });
        }
        const body: CreateWaitlistDto = value as CreateWaitlistDto;

        try {
            const { data: contact } = await resend.contacts.create({
                email: body.email,
                unsubscribed: false,
            });
        
            if(!contact) throw new APIError("Unable to add user to waitlist", STATUS.serverError);
            await resend.contacts.segments.add({
                contactId: contact.id,
                segmentId: segments.waitlist.id,
            });
            await this.emailService.sendWaitlistEmail(body.email);
            return res.status(STATUS.ok).json({
                success: true,
                message: "You have been added to the waitlist successfully",
            });
        } catch (err) {
            throw new APIError("Failed to add to waitlist", STATUS.serverError);
        }

    }
}