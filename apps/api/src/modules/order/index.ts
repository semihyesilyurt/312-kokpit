/**
 * Order Module Exports
 * Barrel file for order module components
 */

// Core module
export { OrderModule } from './order.module';

// Services
export { OrderService } from './order.service';

// Controller
export { OrderController } from './order.controller';

// Gateway
export { OrderGateway } from './order.gateway';

// Processor
export { OrderProcessor } from './order.processor';

// DTOs
export {
  CreateOrderDto,
  CreateOrderItemDto,
  OrderCustomerDto,
  Platform,
  PaymentMethod,
} from './dto/create-order.dto';

export {
  UpdateOrderStatusDto,
  CancelOrderDto,
  AssignCourierDto,
  OrderStatus,
  VALID_STATUS_TRANSITIONS,
  isValidStatusTransition,
  getAllowedNextStatuses,
} from './dto/update-status.dto';

export {
  OrderQueryDto,
  ActiveOrdersQueryDto,
  OrderStatsQueryDto,
  PaymentStatus,
  OrderSortField,
  SortOrder,
} from './dto/order-query.dto';
