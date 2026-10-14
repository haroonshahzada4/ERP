import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login for host-resolved company tenant' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('platform/login')
  @ApiOperation({ summary: 'Login for Platform Super Admin (no company host)' })
  platformLogin(@Body() dto: LoginDto) {
    return this.authService.platformLogin(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token (tenant or platform)' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('platform/refresh')
  @ApiOperation({ summary: 'Rotate platform refresh token (tenantless)' })
  platformRefresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh session' })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Authenticated()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user (platform or tenant)' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }
}
