// ============================================================
// TIPOS — espelham a tabela `pedidos` do Supabase oficial.
// (arquitetura adapter Firebase-sobre-Supabase do site; aqui no app
//  consultamos a tabela `pedidos` direto pelo cliente Supabase)
// ============================================================

export interface ItemPedido {
  id: "infantil" | "meia" | "inteira";
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Comprador {
  uid: string;
  nome: string;
  email: string;
  cpf: string;
}

export interface Pedido {
  id: string;
  visitDate: string; // DATE (YYYY-MM-DD)
  dayCategory?: "weekday" | "weekend";
  items: ItemPedido[];
  totalQuantity: number;
  total: number;
  coupon: string | null;
  comprador: Comprador;
  comprador_uid?: string; // coluna gerada (comprador ->> 'uid')
  criadoEm: string; // timestamptz (ISO)
  // ── Validação (migration 20260622000001_pedidos_validation.sql) ──
  validated_at: string | null; // null = ainda não validado
  validated_by: string | null; // auth.users.id de quem deu a baixa
}

/** Resultado da leitura de um QR Code na portaria. */
export interface ScanResult {
  pedido: Pedido;
  buyerName: string;
  totalTickets: number;
}
