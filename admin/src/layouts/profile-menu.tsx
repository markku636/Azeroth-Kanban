"use client";

import { Title, Text, Avatar, Button, Popover } from "rizzui";
import cn from "@/utils/class-names";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { routes } from "@/config/routes";

function DropdownMenu() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? t('common.profile');
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="w-64 text-left rtl:text-right">
      <div className="flex items-center border-b border-gray-300 px-6 pb-5 pt-6">
        <Avatar
          src={session?.user?.image ?? undefined}
          name={userName}
        />
        <div className="ms-3">
          <Title as="h6" className="font-semibold">
            {userName}
          </Title>
          <Text className="text-gray-600">{userEmail}</Text>
        </div>
      </div>
      <div className="px-6 pb-6 pt-5">
        <Button
          className="h-auto w-full justify-start p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
          variant="text"
          onClick={() => signOut({ callbackUrl: routes.login })}
        >
          {t('common.logout')}
        </Button>
      </div>
    </div>
  );
}

export default function ProfileMenu({
  buttonClassName,
  avatarClassName,
  username = false,
}: {
  buttonClassName?: string;
  avatarClassName?: string;
  username?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useTranslation();
  const userName = session?.user?.name ?? t('common.profile');

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement="bottom-end"
    >
      <Popover.Trigger>
        <button
          className={cn(
            "w-9 shrink-0 rounded-full outline-none focus-visible:ring-[1.5px] focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:translate-y-px sm:w-10",
            buttonClassName,
          )}
        >
          <Avatar
            src={session?.user?.image ?? undefined}
            name={userName}
            className={cn("!h-9 w-9 sm:!h-10 sm:!w-10", avatarClassName)}
          />
          {!!username && (
            <span className="username hidden text-gray-200 md:inline-flex dark:text-gray-700">
              Hi, {userName}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Content className="z-[9999] p-0 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
        <DropdownMenu />
      </Popover.Content>
    </Popover>
  );
}
