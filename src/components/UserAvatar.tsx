interface UserAvatarProps {
  name?: string | null;
  image?: string | null;
  size?: "small" | "medium" | "large";
  showName?: boolean;
}

export function UserAvatar({ name, image, size = "small", showName = false }: UserAvatarProps) {
  const initial = (name || "U").charAt(0).toUpperCase();

  return (
    <div className={`user-avatar-container ${size}`}>
      {image ? (
        <img src={image} alt={name || "User"} className={`user-avatar ${size}`} />
      ) : (
        <div className={`user-avatar-placeholder ${size}`}>{initial}</div>
      )}
      {showName && <span className="user-avatar-name">{name || "Unassigned"}</span>}
    </div>
  );
}
