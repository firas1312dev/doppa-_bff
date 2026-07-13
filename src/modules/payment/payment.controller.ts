import { Controller, Get, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';

@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  async getMyPayments(@ActiveUser() user: ActiveUserData) {
    return this.paymentService.getHistory(user.sub);
  }
}
