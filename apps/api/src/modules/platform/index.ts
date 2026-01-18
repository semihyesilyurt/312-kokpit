/**
 * Platform Module Exports
 */

export { PlatformModule } from './platform.module';
export { PlatformService } from './platform.service';
export { PlatformController } from './platform.controller';
export { PlatformSyncProcessor } from './platform-sync.processor';
export { PlatformSyncScheduler } from './platform-sync.scheduler';
export { MigrosSyncScheduler } from './migros-sync.scheduler';
export { TrendyolSyncScheduler } from './trendyol-sync.scheduler';
export { GetirSyncScheduler } from './getir-sync.scheduler';

// Adapters
export { GetirAdapter } from './adapters/getir.adapter';
export { MigrosAdapter } from './adapters/migros.adapter';
export { TrendyolAdapter } from './adapters/trendyol.adapter';
export {
  PlatformAdapter,
  PlatformOrder,
  PlatformProduct,
  RestaurantStatus,
  SyncResult,
} from './adapters/platform-adapter.interface';
