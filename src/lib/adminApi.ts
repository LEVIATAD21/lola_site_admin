/**
 * Cliente HTTP do painel administrativo LOLA.
 *
 * Segurança:
 * - sessão mantida exclusivamente em cookie HttpOnly pelo servidor;
 * - nenhum token de sessão/chave administrativa é persistido no navegador;
 * - token CSRF fica somente em memória e acompanha operações mutáveis;
 * - respostas nunca são tratadas como sucesso antes da confirmação HTTP.
 *
 * Este cliente implementa o contrato /api/admin/v1. O servidor precisa expor
 * esses endpoints antes de remover o modo de demonstração da interface.
 */

export type AdminRole = 'owner' | 'manager' | 'catalog' | 'fulfillment' | 'support' | 'analyst';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  mfaEnabled: boolean;
}

export interface AdminSession {
  authenticated: boolean;
  user: AdminUser | null;
  csrfToken?: string;
  expiresAt?: string;
}

export interface AdminProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  priceCents: number;
  stock: number;
  published: boolean;
  imageUrl: string | null;
  updatedAt: string;
}

export interface AdminOrder {
  id: string;
  number: string;
  customerName: string;
  customerEmail: string | null;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalCents: number;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  cursor: string | null;
}

export interface ProductInput {
  name: string;
  description: string;
  category: string;
  sku: string;
  priceCents: number;
  stock: number;
  published: boolean;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'ADMIN_API_ERROR') {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

const configuredBase = (import.meta.env.VITE_ADMIN_API_URL as string | undefined)?.trim();
const baseUrl = (configuredBase || '').replace(/\/$/, '');
let csrfToken: string | null = null;

function endpoint(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Caminho administrativo inválido.');
  }
  return `${baseUrl}${path}`;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { csrf?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.csrf) {
    if (!csrfToken) {
      throw new AdminApiError('Sessão expirada. Entre novamente.', 401, 'CSRF_TOKEN_MISSING');
    }
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new AdminApiError('Não foi possível conectar ao servidor administrativo.', 0, 'NETWORK_ERROR');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    if (response.status === 401) csrfToken = null;
    throw new AdminApiError(
      typeof body.error === 'string' ? body.error : 'A operação não foi concluída.',
      response.status,
      typeof body.code === 'string' ? body.code : 'ADMIN_API_ERROR',
    );
  }
  return payload as T;
}

export const adminApi = {
  async login(input: { email: string; password: string; totpCode?: string }): Promise<AdminSession> {
    const session = await request<AdminSession>('/api/admin/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    csrfToken = session.csrfToken ?? null;
    return session;
  },

  async session(): Promise<AdminSession> {
    const session = await request<AdminSession>('/api/admin/v1/auth/session');
    csrfToken = session.csrfToken ?? null;
    return session;
  },

  async logout(): Promise<void> {
    await request<{ success: true }>('/api/admin/v1/auth/logout', { method: 'POST' }, { csrf: true });
    csrfToken = null;
  },

  products(params: { q?: string; cursor?: string; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    return request<AdminPage<AdminProduct>>(`/api/admin/v1/products?${query.toString()}`);
  },

  createProduct(input: ProductInput) {
    return request<AdminProduct>('/api/admin/v1/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }, { csrf: true });
  },

  updateProduct(id: string, input: Partial<ProductInput>) {
    return request<AdminProduct>(`/api/admin/v1/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }, { csrf: true });
  },

  archiveProduct(id: string) {
    return request<{ success: true }>(`/api/admin/v1/products/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    }, { csrf: true });
  },

  uploadProductImage(id: string, file: File) {
    const body = new FormData();
    body.set('image', file);
    return request<{ imageUrl: string }>(
      `/api/admin/v1/products/${encodeURIComponent(id)}/image`,
      { method: 'POST', body },
      { csrf: true },
    );
  },

  orders(params: { cursor?: string; limit?: number; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.status) query.set('status', params.status);
    return request<AdminPage<AdminOrder>>(`/api/admin/v1/orders?${query.toString()}`);
  },

  updateOrderStatus(id: string, status: AdminOrder['status']) {
    return request<AdminOrder>(`/api/admin/v1/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }, { csrf: true });
  },

  inventory() {
    return request<AdminPage<AdminProduct>>('/api/admin/v1/inventory');
  },

  updateInventory(productId: string, input: { quantity: number; reason: string }) {
    return request<AdminProduct>(`/api/admin/v1/inventory/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }, { csrf: true });
  },

  auditLog(params: { cursor?: string; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    return request<AdminPage<{ id: string; actor: string; action: string; target: string; createdAt: string }>>(
      `/api/admin/v1/audit-log?${query.toString()}`,
    );
  },
};

export function isAdminApiConfigured(): boolean {
  return Boolean(baseUrl);
}
