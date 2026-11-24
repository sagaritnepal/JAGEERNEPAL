// app/(reseller)/finance.tsx
import { Redirect } from 'expo-router';

/** Finance opens on the Day Book: the Balance Sheet is under Report now (balance-sheet.tsx). */
export default function FinanceScreen() {
  return <Redirect href={'/(reseller)/daybook' as never} />;
}
