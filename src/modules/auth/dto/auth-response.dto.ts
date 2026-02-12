export class AuthResponseDto {
  accessToken: string;
  admin: {
    id: string;
    username: string;
    email: string;
  };
}

