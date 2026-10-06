import 'server-only'

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { InvoiceCopy } from '../lib/invoice-copy'

// The light theme's tokens as hex - a PDF can't read CSS variables, and the client copy is
// always printed light.
const COLOR = {
  foreground: '#191511',
  muted: '#615d57',
  border: '#e9e4dd',
  primary: '#db5800',
  primarySubtle: '#ffe9d4',
  white: '#ffffff',
}

// Helvetica and Courier are built into every PDF reader, so nothing is embedded. They
// cover $, € and £; a currency like ₹ would need a registered font.
const s = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: COLOR.foreground,
    lineHeight: 1.45,
  },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { marginTop: 30 },
  label: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  mono: { fontFamily: 'Courier' },
  monoBold: { fontFamily: 'Courier-Bold' },
  muted: { color: COLOR.muted },

  logo: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: COLOR.primary,
    color: COLOR.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
    paddingTop: 3,
    marginRight: 7,
  },
  agencyName: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    letterSpacing: 1.5,
    lineHeight: 1,
    marginBottom: 6,
  },

  col3: { width: '33.33%', paddingRight: 12 },
  col2: { width: '50%', paddingRight: 16 },

  qty: { width: 60, textAlign: 'right' },
  rate: { width: 80, textAlign: 'right' },
  amount: { width: 80, textAlign: 'right' },
  lineRow: { flexDirection: 'row', paddingVertical: 5 },

  totals: { width: 220, marginLeft: 'auto' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  amountDue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLOR.primarySubtle,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 9,
    marginTop: 6,
  },

  footer: { marginTop: 36, textAlign: 'center', fontSize: 8.5 },
})

export function InvoicePdf({ copy }: { copy: InvoiceCopy }) {
  return (
    <Document title={`Invoice ${copy.number}`} author={copy.agency.name}>
      <Page size="A4" style={s.page}>
        {/* Agency + title */}
        <View style={s.between}>
          <View>
            <View style={[s.row, { alignItems: 'center', marginBottom: 8 }]}>
              <Text style={s.logo}>{copy.agency.initial}</Text>
              <Text style={s.agencyName}>{copy.agency.name}</Text>
            </View>
            {copy.agency.lines.map((line) => (
              <Text key={line} style={{ fontSize: 8.5 }}>
                {line}
              </Text>
            ))}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>INVOICE</Text>
            <Text style={s.monoBold}>{copy.number}</Text>
          </View>
        </View>

        {/* Billed to / project / dates */}
        <View style={[s.row, s.section]}>
          <View style={s.col3}>
            <Text style={s.label}>Billed to</Text>
            <Text style={[s.bold, { fontSize: 11, marginBottom: 2 }]}>
              {copy.billedTo.name}
            </Text>
            {copy.billedTo.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={s.col3}>
            <Text style={s.label}>Project</Text>
            {copy.project.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={s.col3}>
            <Text style={s.label}>Dates</Text>
            {copy.dates.map((d) => (
              <View key={d.label} style={s.row}>
                <Text style={{ width: 40 }}>{d.label}</Text>
                <Text style={d.emphasis ? s.bold : undefined}>{d.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Lines */}
        <View style={s.section}>
          <View style={[s.row, { marginBottom: 6 }]}>
            <Text style={[s.label, { flex: 1 }]}>Description</Text>
            <Text style={[s.label, s.qty]}>Qty</Text>
            <Text style={[s.label, s.rate]}>Rate</Text>
            <Text style={[s.label, s.amount]}>Amount</Text>
          </View>
          {copy.lines.map((line) => (
            <View key={line.id} style={s.lineRow} wrap={false}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text>{line.description}</Text>
                <Text style={[s.muted, { fontSize: 7.5, letterSpacing: 0.5 }]}>
                  {line.typeLabel}
                </Text>
              </View>
              <Text style={[s.mono, s.qty]}>{line.qty}</Text>
              <Text style={[s.mono, s.rate]}>{line.rate}</Text>
              <Text style={[s.monoBold, s.amount]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={[s.totals, s.section]} wrap={false}>
          {copy.totals.map((t) => (
            <View key={t.label} style={s.totalRow}>
              <Text>{t.label}</Text>
              <Text style={s.mono}>{t.value}</Text>
            </View>
          ))}
          <View style={s.amountDue}>
            <Text style={s.bold}>Amount due</Text>
            <Text style={[s.monoBold, { color: COLOR.primary, fontSize: 12 }]}>
              {copy.amountDue}
            </Text>
          </View>
        </View>

        {/* How to pay / terms */}
        <View style={[s.row, s.section]} wrap={false}>
          <View style={s.col2}>
            <Text style={s.label}>How to pay</Text>
            <Text style={{ fontSize: 8.5 }}>
              {copy.howToPay.before}
              <Text style={s.monoBold}>{copy.howToPay.reference}</Text>
              {copy.howToPay.after}
            </Text>
          </View>
          <View style={s.col2}>
            <Text style={s.label}>Terms</Text>
            <Text style={{ fontSize: 8.5 }}>{copy.terms}</Text>
          </View>
        </View>

        <Text style={s.footer}>{copy.footer}</Text>
      </Page>
    </Document>
  )
}
