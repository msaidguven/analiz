-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.islemler (
  id bigint NOT NULL DEFAULT nextval('islemler_id_seq'::regclass),
  uuid uuid DEFAULT gen_random_uuid() UNIQUE,
  symbol text NOT NULL,
  karar USER-DEFINED NOT NULL,
  durum USER-DEFINED NOT NULL DEFAULT 'AKTIF'::islem_durumu,
  long_oran numeric,
  short_oran numeric,
  risk_skor smallint CHECK (risk_skor >= 1 AND risk_skor <= 10),
  guven smallint CHECK (guven >= 0 AND guven <= 100),
  giris_fiyati numeric NOT NULL,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  cikis_fiyati numeric,
  kapanma_nedeni USER-DEFINED,
  pozisyon_usdt numeric,
  kaldirac smallint DEFAULT 1,
  pnl_yuzde numeric,
  pnl_usdt numeric,
  sure_dakika integer,
  acilis_zamani timestamp with time zone NOT NULL DEFAULT now(),
  kapanis_zamani timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  binance_order_id text,
  binance_durum text DEFAULT 'BEKLIYOR'::text,
  CONSTRAINT islemler_pkey PRIMARY KEY (id)
);