"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Collapse, Title } from "rizzui";
import { cn } from "@/utils/class-names";
import { PiCaretDownBold } from "react-icons/pi";
import SimpleBar from "@/components/ui/simplebar";
import { menuItems, MenuItem } from "@/layouts/hydrogen/menu-items";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/hooks/use-translation";
import { useMenuNewBadge } from "@/hooks/use-menu-new-badge";

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { permissions, isLoading } = usePermissions();
  const { t } = useTranslation();
  const { isNewBadgeVisible, markVisited } = useMenuNewBadge();

  // Filter menu items based on user permissions, hiding empty category labels
  const filteredItems = useMemo(() => {
    if (isLoading) return menuItems;
    if (permissions.length === 0) return menuItems;

    const result: MenuItem[] = [];
    let i = 0;
    while (i < menuItems.length) {
      const item = menuItems[i];
      const isLabel = !item.href;

      if (!isLabel) {
        if (!item.requiredPermission || permissions.includes(item.requiredPermission)) {
          result.push(item);
        }
        i++;
      } else {
        const label = item;
        const children: MenuItem[] = [];
        i++;
        while (i < menuItems.length && menuItems[i].href) {
          children.push(menuItems[i]);
          i++;
        }
        const visibleChildren = children.filter(
          (child) =>
            !child.requiredPermission || permissions.includes(child.requiredPermission)
        );
        if (visibleChildren.length > 0) {
          result.push(label, ...visibleChildren);
        }
      }
    }
    return result;
  }, [permissions, isLoading]);

  useEffect(() => {
    const activeItem = filteredItems.find(
      (i) => i.href === pathname && i.showNewBadge
    );
    if (activeItem?.href) markVisited(activeItem.href);
  }, [pathname, filteredItems, markVisited]);

  return (
    <aside
      className={cn(
        "fixed bottom-0 start-0 z-50 h-full w-[270px] border-e-2 border-gray-100 bg-white 2xl:w-72 dark:bg-gray-100/50",
        className
      )}
    >
      <div className="sticky top-0 z-40 bg-gray-0/10 px-6 pb-4 pt-3 2xl:px-8 2xl:pt-4 dark:bg-gray-100/5">
        <Link
          href={"/"}
          aria-label="Site Logo"
          className="text-gray-800 hover:text-gray-900"
        >
          <Image
            src="/logo.png"
            alt="IQT.AI"
            width={140}
            height={40}
            priority
            className="h-20 w-auto xl:h-10"
          />
        </Link>
      </div>

      <SimpleBar className="h-[calc(100%-80px)]">
        <div className="mt-0 pb-3 3xl:mt-0">
          {filteredItems.map((item, index) => {
            const isActive = pathname === (item?.href as string);
            const pathnameExistInDropdowns = item.dropdownItems?.filter(
              (dropdownItem) => dropdownItem.href === pathname
            );
            const isDropdownOpen = Boolean(pathnameExistInDropdowns?.length);

            return (
              <Fragment key={item.name + "-" + index}>
                {item?.href ? (
                  <>
                    {item.dropdownItems ? (
                      <Collapse
                        defaultOpen={isDropdownOpen}
                        header={({ open, toggle }) => (
                          <div
                            onClick={toggle}
                            className={cn(
                              "group relative mx-3 flex cursor-pointer items-center justify-between rounded-md px-3 py-2 font-medium lg:my-1 2xl:mx-5 2xl:my-2",
                              isDropdownOpen
                                ? "before:top-2/5 text-primary before:absolute before:-start-3 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary 2xl:before:-start-5"
                                : "text-gray-700 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-700/90 dark:hover:text-gray-700"
                            )}
                          >
                            <span className="flex items-center">
                              {item?.icon && (
                                <span
                                  className={cn(
                                    "me-2 inline-flex h-5 w-5 items-center justify-center rounded-md [&>svg]:h-[20px] [&>svg]:w-[20px]",
                                    isDropdownOpen
                                      ? "text-primary"
                                      : "text-gray-800 dark:text-gray-500 dark:group-hover:text-gray-700"
                                  )}
                                >
                                  {item?.icon}
                                </span>
                              )}
                              {t(item.name)}
                            </span>

                            <PiCaretDownBold
                              strokeWidth={3}
                              className={cn(
                                "h-3.5 w-3.5 -rotate-90 text-gray-500 transition-transform duration-200 rtl:rotate-90",
                                open && "rotate-0 rtl:rotate-0"
                              )}
                            />
                          </div>
                        )}
                      >
                        {item.dropdownItems?.map((dropdownItem, index) => {
                          const isChildActive =
                            pathname === (dropdownItem?.href as string);

                          return (
                            <Link
                              href={dropdownItem.href ?? '/'}
                              key={dropdownItem?.name + index}
                              className={cn(
                                "mx-3.5 mb-0.5 flex items-center justify-between rounded-md px-3.5 py-2 font-medium capitalize last-of-type:mb-1 lg:last-of-type:mb-2 2xl:mx-5",
                                isChildActive
                                  ? "text-primary"
                                  : "text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900"
                              )}
                            >
                              <div className="flex items-center truncate">
                                <span
                                  className={cn(
                                    "me-[18px] ms-1 inline-flex h-1 w-1 rounded-full bg-current transition-all duration-200",
                                    isChildActive
                                      ? "bg-primary ring-[1px] ring-primary"
                                      : "opacity-40"
                                  )}
                                />{" "}
                                <span className="truncate">
                                  {t(dropdownItem?.name ?? '')}
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                      </Collapse>
                    ) : (
                      <Link
                        href={item?.href}
                        className={cn(
                          "group relative mx-3 my-0.5 flex items-center justify-between rounded-md px-3 py-2 font-medium capitalize lg:my-1 2xl:mx-5 2xl:my-2",
                          isActive
                            ? "before:top-2/5 text-primary before:absolute before:-start-3 before:block before:h-4/5 before:w-1 before:rounded-ee-md before:rounded-se-md before:bg-primary 2xl:before:-start-5"
                            : "text-gray-700 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-700/90"
                        )}
                      >
                        <div className="flex items-center truncate">
                          {item?.icon && (
                            <span
                              className={cn(
                                "me-2 inline-flex h-5 w-5 items-center justify-center rounded-md [&>svg]:h-[20px] [&>svg]:w-[20px]",
                                isActive
                                  ? "text-primary"
                                  : "text-gray-800 dark:text-gray-500 dark:group-hover:text-gray-700"
                              )}
                            >
                              {item?.icon}
                            </span>
                          )}
                          <span className="truncate">{t(item.name)}</span>
                          {!!item.showNewBadge && isNewBadgeVisible(item.href!) && (
                            <span className="ml-1.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                              NEW
                            </span>
                          )}
                        </div>
                      </Link>
                    )}
                  </>
                ) : (
                  <Title
                    as="h6"
                    className={cn(
                      "mb-2 truncate px-6 text-xs font-normal uppercase tracking-widest text-gray-500 2xl:px-8",
                      index !== 0 && "mt-6 3xl:mt-7"
                    )}
                  >
                    {t(item.name)}
                  </Title>
                )}
              </Fragment>
            );
          })}
        </div>
      </SimpleBar>
    </aside>
  );
}
