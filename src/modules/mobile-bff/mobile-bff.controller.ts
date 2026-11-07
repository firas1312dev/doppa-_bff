import { Controller, Get, UseGuards } from '@nestjs/common';
import { MobileBffService } from './mobile-bff.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';

@Controller({ path: 'mobile', version: '1' })
@UseGuards(JwtAuthGuard)
export class MobileBffController {
  constructor(private readonly bffService: MobileBffService) {}

  @Get('dashboard')
  async getDashboard(@ActiveUser() user: ActiveUserData) {
    return this.bffService.getDashboardPayload(user.sub);
  }

  /** Infos de la salle : adresse, téléphone, horaires (pour l'itinéraire) */
  @Get('gym')
  async getGym() {
    return this.bffService.getGymInfoPayload();
  }

  /** Facturation : abonnement (plan) du tenant + historique des factures */
  @Get('billing')
  async getBilling() {
    return this.bffService.getBillingPayload();
  }
}
