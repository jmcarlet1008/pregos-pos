export const ROUTES = {
  login: '/login',
  order: '/order',
  kitchen: '/kitchen',
  fulfillment: '/fulfillment',
  register: '/register',
  // NOT '/order-management' — main.tsx's boot guard is `path.startsWith('/order')`,
  // which would silently swallow that path and skip Dexie boot entirely (it exists to
  // exempt the public /order/kitchen/fulfillment routes, not this one).
  orderManagement: '/manage-orders',
  inventory: '/inventory',
  menu: '/menu',
  analytics: '/analytics',
  settings: '/settings',
  support: '/support',
} as const
