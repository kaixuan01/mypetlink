import type { MockUser } from "@/types";

export const mockUsers: MockUser[] = [
  {
    id: "usr_aina",
    name: "Aina Rahman",
    email: "aina@example.com",
    role: "owner",
    joinedAt: "03 Jan 2026",
    petCount: 2,
    status: "active",
  },
  {
    id: "usr_jason",
    name: "Jason Lim",
    email: "jason@example.com",
    role: "owner",
    joinedAt: "18 Feb 2026",
    petCount: 1,
    status: "active",
  },
  {
    id: "usr_admin",
    name: "MyPetLink Admin",
    email: "admin@mypetlink.com.my",
    role: "admin",
    joinedAt: "01 Jan 2026",
    petCount: 0,
    status: "active",
  },
];
