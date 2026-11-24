// app/(reseller)/balance-sheet.tsx
import { BalanceSheetScreen } from '../../lib/components/finance/BalanceSheetScreen';

/** The Balance Sheet, under Report (beside the Profit / Loss report). */
export default function ResellerBalanceSheet() {
  return <BalanceSheetScreen basePath="/(reseller)" />;
}
