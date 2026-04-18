import { IsString, Matches } from 'class-validator';

const POSITION_PATTERN = /^(top-left|top-right|bottom-left|bottom-right|extra-\d+)$/;

export class GiveCardDto {
  @IsString()
  @Matches(POSITION_PATTERN, { message: 'Invalid grid position' })
  gridPosition: string;
}
