import HydrogenLayout from "@/layouts/hydrogen/layout";
import GlobalDrawer from "@/app/shared/drawer-views/container";
import GlobalModal from "@/app/shared/modal-views/container";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HydrogenLayout>{children}</HydrogenLayout>
      <GlobalDrawer />
      <GlobalModal />
    </>
  );
}
