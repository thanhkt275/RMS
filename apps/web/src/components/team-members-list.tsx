// apps/web/src/components/team-members-list.tsx

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCog, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TeamMember = {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  name: string;
  email: string;
};

type TeamMembersListProps = {
  members: TeamMember[];
  currentUserRole?: string;
  teamSlug: string;
  currentUserId?: string;
};

const TeamMembersList: React.FC<TeamMembersListProps> = ({
  members,
  currentUserRole,
  teamSlug,
  currentUserId,
}) => {
  const queryClient = useQueryClient();

  const formatJoinedDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  const formatRole = (role: string) => {
    switch (role) {
      case "TEAM_MENTOR":
        return "Mentor";
      case "TEAM_LEADER":
        return "Leader";
      case "TEAM_MEMBER":
        return "Member";
      default:
        return role;
    }
  };

  const canManageMembers =
    currentUserRole === "TEAM_MENTOR" || currentUserRole === "TEAM_LEADER";
  const canChangeToAnyRole = currentUserRole === "TEAM_MENTOR";
  const canRemoveMembers = currentUserRole === "TEAM_MENTOR";

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      newRole,
    }: {
      memberId: string;
      newRole: string;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${teamSlug}/members/${memberId}/role`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update member role");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamSlug] });
      toast.success("Member role updated successfully");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update member role"
      );
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${teamSlug}/members/${memberId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove member");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamSlug] });
      toast.success("Member removed successfully");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove member"
      );
    },
  });

  const handleRoleChange = (memberId: string, newRole: string) => {
    updateRoleMutation.mutate({ memberId, newRole });
  };

  const handleRemoveMember = (memberId: string) => {
    removeMemberMutation.mutate(memberId);
  };

  const getAvailableRoles = (currentRole: string) => {
    if (canChangeToAnyRole) {
      // Mentor can change to any role
      return [
        { value: "TEAM_MEMBER", label: "Member" },
        { value: "TEAM_LEADER", label: "Leader" },
        { value: "TEAM_MENTOR", label: "Mentor" },
      ].filter((role) => role.value !== currentRole);
    }
    // Leader can only change to member
    return currentRole !== "TEAM_MEMBER"
      ? [{ value: "TEAM_MEMBER", label: "Member" }]
      : [];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members ({members.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-muted-foreground">No members in this team yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 text-left font-medium text-muted-foreground">
                    Member
                  </th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">
                    Role
                  </th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">
                    Joined
                  </th>
                  {canManageMembers && (
                    <th className="pb-3 text-left font-medium text-muted-foreground">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr className="hover:bg-muted/50" key={member.id}>
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            alt={member.name}
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.name}`}
                          />
                          <AvatarFallback>
                            {member.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-muted-foreground text-sm">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <Badge variant="secondary">
                        {formatRole(member.role)}
                      </Badge>
                    </td>
                    <td className="py-4 text-muted-foreground text-sm">
                      {formatJoinedDate(member.joinedAt)}
                    </td>
                    {canManageMembers && (
                      <td className="py-4">
                        {member.userId !== currentUserId && (
                          <div className="flex items-center gap-2">
                            {getAvailableRoles(member.role).length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <UserCog className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {getAvailableRoles(member.role).map(
                                    (role) => (
                                      <DropdownMenuItem
                                        disabled={updateRoleMutation.isPending}
                                        key={role.value}
                                        onClick={() =>
                                          handleRoleChange(
                                            member.userId,
                                            role.value
                                          )
                                        }
                                      >
                                        {role.label}
                                      </DropdownMenuItem>
                                    )
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {canRemoveMembers && (
                              <Button
                                disabled={removeMemberMutation.isPending}
                                onClick={() =>
                                  handleRemoveMember(member.userId)
                                }
                                size="sm"
                                variant="destructive"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamMembersList;
