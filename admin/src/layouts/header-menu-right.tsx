"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Badge, ActionIcon } from "rizzui";
import MessagesDropdown from "@/layouts/messages-dropdown";
import NotificationDropdown from "@/layouts/notification-dropdown";
import ProfileMenu from "@/layouts/profile-menu";
import RingBellSolidIcon from "@/components/icons/ring-bell-solid";
import ChatSolidIcon from "@/components/icons/chat-solid";
import { PiSunDuotone, PiMoonDuotone } from "react-icons/pi";
import LanguageSwitcher from "@/components/language-switcher";

export default function HeaderMenuRight() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isAgentPortal = pathname.startsWith('/agent');

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="ms-auto flex shrink-0 items-center gap-2 text-gray-700 xs:gap-3 xl:gap-4">
      {!isAgentPortal && (
        <MessagesDropdown>
          <ActionIcon
            aria-label="Messages"
            variant="text"
            className="relative h-[34px] w-[34px] shadow backdrop-blur-md md:h-9 md:w-9 dark:bg-gray-100"
          >
            <ChatSolidIcon className="h-[18px] w-auto" />
            <Badge
              renderAsDot
              color="success"
              enableOutlineRing
              className="absolute right-2.5 top-2.5 -translate-y-1/3 translate-x-1/2"
            />
          </ActionIcon>
        </MessagesDropdown>
      )}
      {!isAgentPortal && (
        <NotificationDropdown>
          <ActionIcon
            aria-label="Notification"
            variant="text"
            className="relative h-[34px] w-[34px] shadow backdrop-blur-md md:h-9 md:w-9 dark:bg-gray-100"
          >
            <RingBellSolidIcon className="h-[18px] w-auto" />
            <Badge
              renderAsDot
              color="warning"
              enableOutlineRing
              className="absolute right-2.5 top-2.5 -translate-y-1/3 translate-x-1/2"
            />
          </ActionIcon>
        </NotificationDropdown>
      )}

      {/* Dark Mode Toggle */}
      <ActionIcon
        aria-label="Toggle Dark Mode"
        variant="text"
        className="relative h-[34px] w-[34px] shadow backdrop-blur-md md:h-9 md:w-9 dark:bg-gray-100"
        onClick={toggleTheme}
      >
        {!mounted ? (
          <span className="h-[18px] w-[18px]" />
        ) : theme === "dark" ? (
          <PiSunDuotone className="h-[18px] w-auto text-yellow-500" />
        ) : (
          <PiMoonDuotone className="h-[18px] w-auto" />
        )}
      </ActionIcon>

      <LanguageSwitcher />
      <ProfileMenu />
    </div>
  );
}
