"use client";

import HamburgerButton from "@/layouts/hamburger-button";
import SearchWidget from "@/components/search/search";
import Sidebar from "@/layouts/hydrogen/sidebar";
import HeaderMenuRight from "@/layouts/header-menu-right";
import StickyHeader from "@/layouts/sticky-header";

export default function Header() {
  return (
    <StickyHeader className="2xl:py-5 3xl:px-8 4xl:px-10">
      <div className="flex flex-1 items-center">
        <HamburgerButton
          view={<Sidebar className="static w-full 2xl:w-full" />}
        />
        <SearchWidget />
      </div>

      <HeaderMenuRight />
    </StickyHeader>
  );
}
