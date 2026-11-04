import Chamber from "@/components/Chamber";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Chamber code={code.toUpperCase()} />;
}
