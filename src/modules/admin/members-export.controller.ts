import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admin.service';

/**
 * Route publique de téléchargement du CSV des membres.
 * Elle n'est pas protégée par le JwtAuthGuard : l'autorisation passe par un
 * jeton court signé (?token=...) généré via /admin/members/export-token.
 * Ouverte dans le navigateur du téléphone → produit un vrai fichier .csv.
 */
@Controller({ path: 'admin/members/export', version: '1' })
export class MembersExportController {
  constructor(private readonly adminService: AdminService) {}

  @Get('download')
  async download(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new BadRequestException('Jeton de téléchargement manquant.');
    }
    const { csv, filename } = await this.adminService.buildCsvFromToken(token);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
