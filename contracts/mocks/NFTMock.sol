// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '../ERC721WithPermit.sol';

contract NFTMock is ERC721('Mock721', 'MOCK'), ERC721WithPermit {
    uint256 private _lastTokenId;

    /// @notice Mint next to
    function mint() public {
        _mint(msg.sender, ++_lastTokenId);
    }

    /// @notice Allows to get approved using a permit and transfer in the same call
    /// @dev this supposes that the permit is for msg.sender
    /// @param from current owner
    /// @param to recipient
    /// @param tokenId the token id
    /// @param _data optional data to add
    /// @param deadline the deadline for the permit to be used
    /// @param signature of permit
    function safeTransferFromWithPermit(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data,
        uint256 deadline,
        bytes memory signature
    ) external {
        // use the permit to get msg.sender approved
        permit(msg.sender, tokenId, deadline, signature);

        // do the transfer
        safeTransferFrom(from, to, tokenId, _data);
    }

    /// @inheritdoc ERC721
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721WithPermit) {
        // do normal transfer
        super._transfer(from, to, tokenId);
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721WithPermit)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
