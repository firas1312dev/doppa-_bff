import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, UseGuards, UsePipes,
  ValidationPipe, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminClassesService } from './admin-classes.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CreateClassScheduleDto } from './dto/create-class-schedule.dto';
import { UpdateClassScheduleDto } from './dto/update-class-schedule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminClassesService: AdminClassesService,
  ) {}

  // ─── Members CRUD ────────────────────────────────────────────────────────────

  /** GET /admin/members?page=1&limit=15&search=John&status=active */
  @Get('members')
  getMembers(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'active' | 'inactive',
  ) {
    return this.adminService.getMembers(page, limit, search, status ?? 'all');
  }

  /** GET /admin/members/export?search=&status= — export CSV de tous les membres filtrés */
  @Get('members/export')
  exportMembers(
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'active' | 'inactive',
  ) {
    return this.adminService.exportMembersCsv(search, status ?? 'all');
  }

  /**
   * GET /admin/members/export-token?search=&status=
   * Renvoie un jeton court pour télécharger le CSV comme vrai fichier via le
   * navigateur (route publique /admin/members/export/download?token=...).
   */
  @Get('members/export-token')
  exportMembersToken(
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'active' | 'inactive',
  ) {
    return this.adminService.generateExportToken(search, status ?? 'all');
  }

  /** GET /admin/members/:id */
  @Get('members/:id')
  getMember(@Param('id') globalId: string) {
    return this.adminService.getMember(globalId);
  }

  /** POST /admin/members */
  @Post('members')
  createMember(@Body() dto: CreateMemberDto) {
    return this.adminService.createMember(dto);
  }

  /** PUT /admin/members/:id */
  @Put('members/:id')
  updateMember(@Param('id') globalId: string, @Body() dto: UpdateMemberDto) {
    return this.adminService.updateMember(globalId, dto);
  }

  /** DELETE /admin/members/:id */
  @Delete('members/:id')
  @HttpCode(HttpStatus.OK)
  deleteMember(@Param('id') globalId: string) {
    return this.adminService.deleteMember(globalId);
  }

  // ─── Class schedules CRUD ────────────────────────────────────────────────────

  /** GET /admin/class-schedules?filter=all|upcoming|past */
  @Get('class-schedules')
  getClasses(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('filter') filter?: 'all' | 'upcoming' | 'past',
  ) {
    return this.adminClassesService.listClasses(page, limit, filter ?? 'all');
  }

  @Get('class-schedules/:id')
  getClass(@Param('id', ParseIntPipe) id: number) {
    return this.adminClassesService.getClass(id);
  }

  @Post('class-schedules')
  createClass(@Body() dto: CreateClassScheduleDto) {
    return this.adminClassesService.createClass(dto);
  }

  @Put('class-schedules/:id')
  updateClass(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassScheduleDto,
  ) {
    return this.adminClassesService.updateClass(id, dto);
  }

  @Delete('class-schedules/:id')
  @HttpCode(HttpStatus.OK)
  deleteClass(@Param('id', ParseIntPipe) id: number) {
    return this.adminClassesService.deleteClass(id);
  }
}
