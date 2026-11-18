import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectSheetButton } from "../connect-sheet-button";

export const metadata = { title: "Add a sheet · Sheet2Dash" };

export default function NewSheetPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add another sheet</CardTitle>
        <CardDescription>
          Pick another spreadsheet to get its own dashboard. Your other sheets, their layouts and
          sharing stay as they are. The app can only see the files you pick, and never changes
          them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConnectSheetButton>Pick a spreadsheet</ConnectSheetButton>
      </CardContent>
    </Card>
  );
}
