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
  compartilhado_em?: string | null;
  compartilhado_por?: string | null;
  destinatario_nome?: string | null;
  destinatario_cpf?: string | null;
}

export interface QrCodeAccess {
  id: string;
  purchase_id: string;
  parent_qr_code_id: string | null;
  tipo: "pai" | "filho";
  nome_vinculado: string | null;
  cpf_vinculado: string | null;
  destinatario_nome: string | null;
  destinatario_cpf: string | null;
  visit_date: string;
  adulto_total: number;
  meia_total: number;
  infantil_total: number;
  adulto_disponivel: number;
  meia_disponivel: number;
  infantil_disponivel: number;
  adulto_validado: number;
  meia_validado: number;
  infantil_validado: number;
  status: "ativo" | "cancelado" | "expirado";
  qr_code_token: string;
  criado_em: string;
}

/** Resultado da leitura de um QR Code na portaria. */
export interface ScanResult {
  pedido: Pedido;
  qrCode: QrCodeAccess;
  buyerName: string;
  ticketHolderName: string;
  ticketHolderCpf: string | null;
  isShared: boolean;
  totalTickets: number;
}
