{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              google-cloud-sdk # https://search.nixos.org/packages?channel=unstable&type=packages&show=google-cloud-sdk
              nodejs-slim # https://search.nixos.org/packages?channel=unstable&type=packages&show=nodejs-slim
            ];

            shellHook = ''
              # Vercel CLI is not available from nixpkgs.
              # Install it via npm into a local prefix, so it is
              # available in the shell without polluting global packages.
              export VERCEL_PREFIX="$HOME/.cache/nix-vercel"
              if ! command -v vercel &>/dev/null && [ ! -x "$VERCEL_PREFIX/bin/vercel" ]; then
                echo "Installing Vercel CLI into $VERCEL_PREFIX …"
                npm install --global --prefix "$VERCEL_PREFIX" vercel
              fi
              export PATH="$VERCEL_PREFIX/bin:$PATH"

              echo "Vercel CLI is ready to use!"
            '';
          };
        }
      );
    };
}
