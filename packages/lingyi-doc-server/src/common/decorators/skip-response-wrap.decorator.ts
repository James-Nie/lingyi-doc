import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap';

/** 跳过 { code: 0, data } 包装（如 health 接口） */
export const SkipResponseWrap = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
