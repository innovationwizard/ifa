/**
 * NIIF-PYME starter chart of accounts — Guatemala MIPYME template.
 *
 * Source and scope
 * ----------------
 * Structure and classification follow the IFRS Foundation's *IFRS for
 * SMEs* standard ("NIIF para las PYMES"), Section 4 "Statement of
 * Financial Position" and Section 5 "Statement of Comprehensive Income",
 * which is the regulatory framework adopted in Guatemala for SME
 * reporting.
 *   Reference: https://www.ifrs.org/issued-standards/ifrs-for-smes/
 *   Spanish translation: published by the IFRS Foundation as
 *   "NIIF para las PYMES" (2015 edition, latest review 2025).
 *
 * The specific account CODES below (1101 Caja, 6101 Sueldos, etc.)
 * follow widely taught Guatemalan accounting convention as practiced by
 * IGCPA (Instituto Guatemalteco de Contadores Públicos y Auditores) and
 * CCPAG (Colegio de Contadores Públicos y Auditores de Guatemala).
 * They are not a prescriptive, single-source catalog — any Guatemalan
 * CPA may adjust sub-account numbering for a specific client.
 *
 * Intent (scaffolding §7.3): provide a CUSTOMIZABLE starter so every
 * new organization has a working chart on day one of onboarding
 * (S-2.11). Accounts seeded by this function are marked
 * `isSystemAccount = true` to guard against accidental deletion; users
 * can add, deactivate, and rename accounts via the chart of accounts UI
 * (S-5.1).
 *
 * Rule-4 status: REAL (sourced). The structure derives from the
 * published NIIF-PYME standard; the codes follow Guatemalan convention.
 * A client's CPA should review and adjust before production use for
 * that specific organization.
 *
 * Sourced: 2026-04-21.
 */

import type { AccountType } from '@prisma/client';

export interface ChartAccountTemplate {
  code: string;
  name: string;
  type: AccountType;
  /** Parent account code — `null` for top-level class headers. */
  parentCode: string | null;
}

/*
 * Account classes (five top-level headers). These five are universal
 * across every NIIF-PYME-aligned chart in Guatemala — a chart that
 * lacks any of them is malformed.
 */
export const CHART_OF_ACCOUNTS_TEMPLATE: ChartAccountTemplate[] = [
  // ---------------------------------------------------------------------------
  // 1 — ACTIVOS
  // ---------------------------------------------------------------------------
  { code: '1000', name: 'Activos', type: 'ASSET', parentCode: null },
  { code: '1100', name: 'Activos corrientes', type: 'ASSET', parentCode: '1000' },
  { code: '1101', name: 'Caja', type: 'ASSET', parentCode: '1100' },
  { code: '1102', name: 'Bancos', type: 'ASSET', parentCode: '1100' },
  { code: '1103', name: 'Cuentas por cobrar', type: 'ASSET', parentCode: '1100' },
  { code: '1104', name: 'Inventarios', type: 'ASSET', parentCode: '1100' },
  { code: '1105', name: 'IVA por cobrar (crédito fiscal)', type: 'ASSET', parentCode: '1100' },
  { code: '1106', name: 'Pagos anticipados', type: 'ASSET', parentCode: '1100' },
  { code: '1200', name: 'Activos no corrientes', type: 'ASSET', parentCode: '1000' },
  { code: '1201', name: 'Mobiliario y equipo', type: 'ASSET', parentCode: '1200' },
  { code: '1202', name: 'Equipo de cómputo', type: 'ASSET', parentCode: '1200' },
  { code: '1203', name: 'Vehículos', type: 'ASSET', parentCode: '1200' },
  { code: '1204', name: 'Edificios e instalaciones', type: 'ASSET', parentCode: '1200' },
  {
    code: '1290',
    name: 'Depreciación acumulada (cuenta correctora)',
    type: 'ASSET',
    parentCode: '1200',
  },

  // ---------------------------------------------------------------------------
  // 2 — PASIVOS
  // ---------------------------------------------------------------------------
  { code: '2000', name: 'Pasivos', type: 'LIABILITY', parentCode: null },
  { code: '2100', name: 'Pasivos corrientes', type: 'LIABILITY', parentCode: '2000' },
  { code: '2101', name: 'Cuentas por pagar a proveedores', type: 'LIABILITY', parentCode: '2100' },
  {
    code: '2102',
    name: 'Préstamos bancarios a corto plazo',
    type: 'LIABILITY',
    parentCode: '2100',
  },
  { code: '2103', name: 'IVA por pagar (débito fiscal)', type: 'LIABILITY', parentCode: '2100' },
  { code: '2104', name: 'ISR por pagar', type: 'LIABILITY', parentCode: '2100' },
  { code: '2105', name: 'Sueldos y prestaciones por pagar', type: 'LIABILITY', parentCode: '2100' },
  { code: '2106', name: 'IGSS e IRTRA por pagar', type: 'LIABILITY', parentCode: '2100' },
  { code: '2200', name: 'Pasivos no corrientes', type: 'LIABILITY', parentCode: '2000' },
  {
    code: '2201',
    name: 'Préstamos bancarios a largo plazo',
    type: 'LIABILITY',
    parentCode: '2200',
  },
  { code: '2202', name: 'Hipotecas por pagar', type: 'LIABILITY', parentCode: '2200' },

  // ---------------------------------------------------------------------------
  // 3 — PATRIMONIO
  // ---------------------------------------------------------------------------
  { code: '3000', name: 'Patrimonio', type: 'EQUITY', parentCode: null },
  { code: '3101', name: 'Capital social', type: 'EQUITY', parentCode: '3000' },
  { code: '3102', name: 'Aportaciones de socios', type: 'EQUITY', parentCode: '3000' },
  { code: '3201', name: 'Reservas legales', type: 'EQUITY', parentCode: '3000' },
  { code: '3301', name: 'Utilidades retenidas', type: 'EQUITY', parentCode: '3000' },
  { code: '3401', name: 'Resultado del ejercicio', type: 'EQUITY', parentCode: '3000' },

  // ---------------------------------------------------------------------------
  // 4 — INGRESOS
  // ---------------------------------------------------------------------------
  { code: '4000', name: 'Ingresos', type: 'REVENUE', parentCode: null },
  { code: '4100', name: 'Ingresos ordinarios', type: 'REVENUE', parentCode: '4000' },
  { code: '4101', name: 'Ventas de bienes', type: 'REVENUE', parentCode: '4100' },
  { code: '4102', name: 'Prestación de servicios', type: 'REVENUE', parentCode: '4100' },
  {
    code: '4190',
    name: 'Devoluciones y descuentos sobre ventas (cuenta correctora)',
    type: 'REVENUE',
    parentCode: '4100',
  },
  { code: '4200', name: 'Otros ingresos', type: 'REVENUE', parentCode: '4000' },
  { code: '4201', name: 'Ingresos financieros', type: 'REVENUE', parentCode: '4200' },
  { code: '4202', name: 'Ganancias cambiarias', type: 'REVENUE', parentCode: '4200' },

  // ---------------------------------------------------------------------------
  // 5 — COSTOS
  // ---------------------------------------------------------------------------
  { code: '5000', name: 'Costos', type: 'EXPENSE', parentCode: null },
  { code: '5101', name: 'Costo de ventas', type: 'EXPENSE', parentCode: '5000' },
  { code: '5102', name: 'Costo de servicios prestados', type: 'EXPENSE', parentCode: '5000' },

  // ---------------------------------------------------------------------------
  // 6 — GASTOS
  // ---------------------------------------------------------------------------
  { code: '6000', name: 'Gastos', type: 'EXPENSE', parentCode: null },
  { code: '6100', name: 'Gastos de operación', type: 'EXPENSE', parentCode: '6000' },
  { code: '6101', name: 'Sueldos y salarios', type: 'EXPENSE', parentCode: '6100' },
  {
    code: '6102',
    name: 'Bonificaciones y prestaciones laborales',
    type: 'EXPENSE',
    parentCode: '6100',
  },
  { code: '6103', name: 'Arrendamiento de local', type: 'EXPENSE', parentCode: '6100' },
  {
    code: '6104',
    name: 'Servicios básicos (agua, luz, teléfono, internet)',
    type: 'EXPENSE',
    parentCode: '6100',
  },
  { code: '6105', name: 'Combustibles y lubricantes', type: 'EXPENSE', parentCode: '6100' },
  { code: '6106', name: 'Mantenimiento y reparaciones', type: 'EXPENSE', parentCode: '6100' },
  { code: '6107', name: 'Papelería y útiles de oficina', type: 'EXPENSE', parentCode: '6100' },
  { code: '6108', name: 'Publicidad y mercadeo', type: 'EXPENSE', parentCode: '6100' },
  { code: '6109', name: 'Depreciación', type: 'EXPENSE', parentCode: '6100' },
  { code: '6110', name: 'Amortización', type: 'EXPENSE', parentCode: '6100' },
  { code: '6111', name: 'Honorarios profesionales', type: 'EXPENSE', parentCode: '6100' },
  { code: '6112', name: 'Seguros', type: 'EXPENSE', parentCode: '6100' },
  { code: '6113', name: 'Transporte y flete', type: 'EXPENSE', parentCode: '6100' },
  { code: '6114', name: 'Cuotas patronales IGSS', type: 'EXPENSE', parentCode: '6100' },
  { code: '6200', name: 'Gastos financieros', type: 'EXPENSE', parentCode: '6000' },
  { code: '6201', name: 'Intereses sobre préstamos', type: 'EXPENSE', parentCode: '6200' },
  { code: '6202', name: 'Comisiones bancarias', type: 'EXPENSE', parentCode: '6200' },
  { code: '6203', name: 'Pérdidas cambiarias', type: 'EXPENSE', parentCode: '6200' },
  { code: '6300', name: 'Impuestos y contribuciones', type: 'EXPENSE', parentCode: '6000' },
  { code: '6301', name: 'Impuesto sobre la Renta (ISR)', type: 'EXPENSE', parentCode: '6300' },
  { code: '6302', name: 'Impuesto de Solidaridad (ISO)', type: 'EXPENSE', parentCode: '6300' },
  {
    code: '6303',
    name: 'Impuesto Único Sobre Inmuebles (IUSI)',
    type: 'EXPENSE',
    parentCode: '6300',
  },
  {
    code: '6304',
    name: 'Otros impuestos y arbitrios municipales',
    type: 'EXPENSE',
    parentCode: '6300',
  },
];
