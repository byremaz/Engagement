import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @Length(2, 60)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;
}

export class JoinSessionDto {
  /** Display name: the only required personal input (spec §5.1). Any script is preserved. */
  @IsString()
  @Length(2, 24)
  @Matches(/^[^\p{C}<>]+$/u, { message: 'name must not contain control characters or angle brackets' })
  name!: string;
}

export class RestoreDto {
  @IsString()
  @Matches(/^[A-Z2-9]{8}$/, { message: 'recoveryCode must be 8 characters (A-Z, 2-9)' })
  recoveryCode!: string;
}

export class RenameParticipantDto {
  @IsString()
  @Length(2, 24)
  @Matches(/^[^\p{C}<>]+$/u)
  name!: string;
}

export class SetJoinOpenDto {
  @IsBoolean()
  open!: boolean;
}

export class SetSignalModeDto {
  @IsIn(['MANUAL', 'AUTO'])
  mode!: 'MANUAL' | 'AUTO';
}

export class VoidRoundDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}

export class CursorQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
