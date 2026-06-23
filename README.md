# Clube Oásis — Validador de Ingressos (App da Portaria)

App mobile (React Native + Expo) para **administração e validação de ingressos
na portaria** do Clube Oásis. É um projeto **separado** do site `clube-oasis`,
mas conectado ao **mesmo projeto Supabase** — portanto compartilha login,
tabelas e regras de segurança (RLS).

> ⚠️ Este app **não altera nada** no site. A integração entre os dois é o
> Supabase compartilhado.

## O que o app faz

- **Login unificado** (e-mail + senha) no mesmo Supabase Auth do site.
  Só usuários presentes na tabela `admins` entram (mesmo gate do site).
- **Painel mobile**: versão de celular do dashboard admin (receita, ingressos,
  vendas de hoje, validados) com atualização em tempo real (Realtime).
- **Leitor de QR Code**: lê o QR do ingresso (que codifica o `id` do pedido),
  consulta o banco e mostra **comprador**, **quantidade de ingressos** e
  **status** (validado ou pendente).
- **Validação**: botão que dá baixa no ingresso (`validated_at` + `validated_by`),
  refletindo no painel em tempo real e impedindo baixa dupla.

---

## Pré-requisitos

- Node.js 18+
- App **Expo Go** no celular (Android/iOS) **ou** um emulador
- Acesso ao painel do Supabase do projeto (`jczgcfibllslffaawjos`)

## Passo 1 — Rodar a migration no Supabase

A migration de validação vive no repositório oficial do site, em
`clube-oasis/supabase/migrations/20260622000001_pedidos_validation.sql`.
No painel do Supabase → **SQL Editor**, cole e execute o conteúdo dela.

Ela é **aditiva** (não quebra o site). Adiciona:
- colunas `validated_at` / `validated_by` na tabela `pedidos`;
- policy `pedidos_admin_update` (só admin dá baixa);
- `replica identity full` em `pedidos` (baixa em tempo real).

O nome do comprador já vem embutido em `pedidos.comprador.nome` — não precisa
de policy de leitura de perfil.

## Passo 2 — Criar a conta de admin da portaria

Como o login do app é por **e-mail/senha**, crie uma conta para a portaria:

1. Supabase → **Authentication → Users → Add user**
   - E-mail + senha; marque **Auto Confirm User**.
2. Copie o **UID** do usuário criado.
3. Supabase → **SQL Editor**:
   ```sql
   insert into public.admins (uid) values ('COLE-O-UID-AQUI')
   on conflict do nothing;
   ```

> Contas que já são admin via Google **continuam admin**, mas para logar no app
> elas precisam ter uma senha definida (Auth → Users → … → Reset password) ou
> use uma conta de e-mail/senha dedicada à portaria, como acima.

## Passo 3 — Instalar e rodar

```bash
cd "clube-oasis-validador"
npm install
npm start
```

Depois, leia o QR com o **Expo Go** (Android) ou a Câmera (iOS).
As credenciais do Supabase já estão em `.env` (mesma instância do site).

---

## Como testar o validador

O site **já emite o QR Code** na aba **Meus Ingressos** (página
`meus-ingressos`, que codifica o `id` do pedido). Para testar:

1. No site, com um usuário logado que tenha pedidos, abra **Meus Ingressos**
   e use o QR exibido no card. (Alternativa: Supabase → **Table Editor →
   pedidos** → copie um `id` e gere um QR dele em qualquer gerador online.)
2. Faça login no app → aba **Validar** → aponte a câmera para o QR.
   O app mostra comprador + ingressos + status e permite dar baixa.

O leitor aceita tanto o **UUID puro** quanto uma **URL que contenha o UUID**
(ex.: `https://clubeoasis.com/ingresso/<uuid>`).

---

## Estrutura

```
clube-oasis-validador/
├── app/
│   ├── _layout.tsx          # provider de auth + gate de navegação
│   ├── index.tsx            # tela de login (e-mail/senha)
│   └── (app)/               # área protegida (só admin)
│       ├── _layout.tsx      # abas: Painel + Validar
│       ├── dashboard.tsx    # painel mobile (Realtime)
│       └── scanner.tsx      # leitor de QR + validação
├── lib/
│   ├── supabase.ts          # client Supabase (AsyncStorage)
│   ├── auth.tsx             # contexto de auth + checagem de admin
│   ├── types.ts             # tipos (espelham o banco)
│   └── theme.ts             # paleta/identidade visual
├── components/LogoutButton.tsx
└── .env                     # mesma URL + publishable key do site
```

## Próximos passos (futuro, com autorização)

- **Site**: na confirmação de compra, exibir/enviar um QR com o `id` do pedido
  (e, idealmente, capturar nome por pessoa se quiser nomes individuais).
- **Validação por item**: hoje a baixa é por pedido. Se quiser validar pessoa a
  pessoa, será preciso modelar "ingresso individual" no banco.
