// app/(wholesaler)/balance-sheet.tsx
import { BalanceSheetScreen } from '../../lib/components/finance/BalanceSheetScreen';

/** The Balance Sheet, under Report (beside the Profit / Loss report). */
export default function WholesalerBalanceSheet() {
  return <BalanceSheetScreen basePath="/(wholesaler)" />;
}
