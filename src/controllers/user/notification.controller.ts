import { RequestAuth } from "@/@types/request";
import { STATUS } from "@/constants/status.constant";
import { NotificationService } from "@/services/user/notification.service";
import { Response } from "express";
import { Service } from "typedi"

@Service()
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService
    ){}
    async toggleEmailNotification(req: RequestAuth, res: Response){
        const email = req.user.email;
        const { message, payload } = await this.notificationService.toggleEmailNotification(email);

        return res.status(STATUS.ok).json({
            message,
            payload
        })
    }
}