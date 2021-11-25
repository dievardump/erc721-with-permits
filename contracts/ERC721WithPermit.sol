//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

import './IERC721WithPermit.sol';

/// @title ERC721WithPermit
/// @author Simon Fremaux (@dievardump) & William Schwab (@wschwab)
/// @notice This implementation of Permits links the nonce to the tokenId instead of the owner
///         This way, it is possible for a same account to create several usable permits at the same time,
///         for different ids
///
///         This implementation overrides _transfer and increments the nonce linked to a tokenId
///         every time it is transfered
abstract contract ERC721WithPermit is IERC721WithPermit, ERC721 {
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256(
            'Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)'
        );

    bytes32 internal _DOMAIN_SEPARATOR;

    mapping(uint256 => uint256) private _nonces;

    // function to initialize the contract
    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
    {
        // this creates the DOMAIN_SEPARATOR used in EIP-712
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
                ),
                keccak256(bytes(name_)),
                keccak256(bytes('1')),
                block.chainid,
                address(this)
            )
        );
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    /// @notice Allows to retrieve current nonce for token
    /// @param tokenId token id
    /// @return current token nonce
    function nonces(uint256 tokenId) public view returns (uint256) {
        require(_exists(tokenId), '!UNKNOWN_TOKEN!');
        return _nonces[tokenId];
    }

    /// @notice function to be called by anyone to approve `spender` using a Permit signature
    /// @dev Anyone can call this to approve `spender`, even a third-party
    /* /// @param owner the owner of the token */
    /// @param spender the actor to approve
    /// @param tokenId the token id
    /// @param deadline the deadline for the permit to be used
    /// @param signature permit
    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        bytes memory signature
    ) public {
        require(deadline >= block.timestamp, '!PERMIT_DEADLINE_EXPIRED!');

        bytes32 digest = _buildDigest(
            // owner,
            spender,
            tokenId,
            _nonces[tokenId],
            deadline
        );

        (address recoveredAddress, ) = ECDSA.tryRecover(digest, signature);
        require(
            // verify if the recovered address is owner or approved on tokenId
            // and make sure recoveredAddress is not address(0), else getApproved(tokenId) might match
            (recoveredAddress != address(0) &&
                _isApprovedOrOwner(recoveredAddress, tokenId)) ||
                // else try to recover signature using SignatureChecker, which also allows to recover signature made by contracts
                SignatureChecker.isValidSignatureNow(
                    ownerOf(tokenId),
                    digest,
                    signature
                ),
            '!INVALID_PERMIT_SIGNATURE!'
        );

        _approve(spender, tokenId);
    }

    /// @notice Builds the permit digest to sign
    /// @param spender the token spender
    /// @param tokenId the tokenId
    /// @param nonce the nonce to make a permit for
    /// @param deadline the deadline before when the permit can be used
    /// @return the digest (following eip712) to sign
    function _buildDigest(
        address spender,
        uint256 tokenId,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            ECDSA.toTypedDataHash(
                _DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        spender,
                        tokenId,
                        nonce,
                        deadline
                    )
                )
            );
    }

    /// @dev helper to easily increment a nonce for a given tokenId
    /// @param tokenId the tokenId to increment the nonce for
    function _incrementNonce(uint256 tokenId) internal {
        _nonces[tokenId]++;
    }

    /// @dev _transfer override to be able to increment the nonce
    /// @inheritdoc ERC721
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        // increment the nonce to be sure it can't be reused
        _incrementNonce(tokenId);

        // do normal transfer
        super._transfer(from, to, tokenId);
    }

    /// @notice Query if a contract implements an interface
    /// @param interfaceId The interface identifier, as specified in ERC-165
    /// @dev Overriden from ERC721 here in order to include the interface of this EIP
    /// @return `true` if the contract implements `interfaceID` and
    ///  `interfaceID` is not 0xffffffff, `false` otherwise
    function supportsInterface(bytes4 interfaceId) public override pure returns (bool) {
        return
            interfaceId == type(IERC721WithPermit).interfaceId || // 0x5604e225
            super.supportsInterface(interfaceId); 
    }
}
