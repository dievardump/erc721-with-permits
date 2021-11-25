const { expect } = require('chai');
const { deployments, ethers } = require('hardhat');

const _INTERFACE_ID_ERC721 = '0x80ac58cd';
const _INTERFACE_ID_ERC721_METADATA = '0x5b5e139f';
const _INTERFACE_ID_ERC165 = '0x01ffc9a7';
const _INTERFACE_WITH_PERMIT = '0x5604e225';

describe('NFTMockWithPermiit', () => {
    // helper to sign using (spender, tokenId, nonce, deadline) EIP 712
    async function sign(spender, tokenId, nonce, deadline) {
        const typedData = {
            types: {
                Permit: [
                    { name: 'spender', type: 'address' },
                    { name: 'tokenId', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                ],
            },
            primaryType: 'Permit',
            domain: {
                name: await contract.name(),
                version: '1',
                chainId: chainId,
                verifyingContract: contract.address,
            },
            message: {
                spender,
                tokenId,
                nonce,
                deadline,
            },
        };

        // sign Permit
        const signature = await deployer._signTypedData(
            typedData.domain,
            { Permit: typedData.types.Permit },
            typedData.message,
        );

        return signature;
    }

    before(async () => {
        [deployer, bob, alice] = await ethers.getSigners();

        // get chainId
        chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    });

    beforeEach(async () => {
        await deployments.fixture();

        const NFTMock = await ethers.getContractFactory('NFTMock');
        contract = await NFTMock.deploy();
        await contract.deployed();

        // mint tokenId 1  to deployer
        await contract.mint();
    });

    describe('Interfaces', async function () {
        it('has all the right interfaces', async function () {
            const interfaces = [
                _INTERFACE_ID_ERC721,
                _INTERFACE_ID_ERC721_METADATA,
                _INTERFACE_ID_ERC165,
                _INTERFACE_WITH_PERMIT,
            ];
            for (const interface of interfaces) {
                expect(await contract.supportsInterface(interface)).to.be.true;
            }
        });
    });
    describe('Permit', async function () {
        it('nonce increments after each transfer', async function () {
            expect(await contract.nonces(1)).to.be.equal(0);

            await contract.transferFrom(
                await deployer.getAddress(),
                await bob.getAddress(),
                1,
            );

            expect(await contract.nonces(1)).to.be.equal(1);

            await contract
                .connect(bob)
                .transferFrom(
                    await bob.getAddress(),
                    await deployer.getAddress(),
                    1,
                );

            expect(await contract.nonces(1)).to.be.equal(2);
        });

        it('can use permit to get approved', async function () {
            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // sign Permit for bob
            const signature = await sign(
                await bob.getAddress(),
                1,
                await contract.nonces(1),
                deadline,
            );

            // verify that bob is not approved before permit is used
            expect(await contract.getApproved(1)).to.not.equal(
                await bob.getAddress(),
            );

            // use permit
            await contract
                .connect(bob)
                .permit(await bob.getAddress(), 1, deadline, signature);

            // verify that now bob is approved
            expect(await contract.getApproved(1)).to.be.equal(
                await bob.getAddress(),
            );
        });

        it('can not use a permit after a transfer (cause nonce does not match)', async function () {
            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // sign Permit for bob
            const signature = await sign(
                await bob.getAddress(),
                1,
                await contract.nonces(1),
                deadline,
            );

            // first transfer to alice
            await contract.transferFrom(
                await deployer.getAddress(),
                await alice.getAddress(),
                1,
            );

            // then send back to deployer so owner is right (but nonce won't be)
            await contract
                .connect(alice)
                .transferFrom(
                    await alice.getAddress(),
                    await deployer.getAddress(),
                    1,
                );

            // then try to use permit, should throw because nonce is not valid anymore
            await expect(
                contract
                    .connect(bob)
                    .permit(await bob.getAddress(), 1, deadline, signature),
            ).to.be.revertedWith('!INVALID_PERMIT_SIGNATURE!');
        });

        it('can not use a permit with right nonce but wrong owner', async function () {
            // first transfer to someone
            await contract.transferFrom(
                await deployer.getAddress(),
                await alice.getAddress(),
                1,
            );

            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // sign Permit for bob
            // Permit will be signed using deployer account, so nonce is right, but owner isn't
            const signature = await sign(
                await bob.getAddress(),
                1,
                1, // nonce is one here
                deadline,
            );

            // then try to use permit, should throw because owner is wrong
            await expect(
                contract
                    .connect(bob)
                    .permit(await bob.getAddress(), 1, deadline, signature),
            ).to.be.revertedWith('!INVALID_PERMIT_SIGNATURE!');
        });

        it('can not use a permit expired', async function () {
            // set deadline 7 days in the past
            const deadline = parseInt(+new Date() / 1000) - 7 * 24 * 60 * 60;

            // sign Permit for bob
            // this Permit is expired as deadline is in the past
            const signature = await sign(
                await bob.getAddress(),
                1,
                await contract.nonces(1),
                deadline,
            );

            await expect(
                contract
                    .connect(bob)
                    .permit(await bob.getAddress(), 1, deadline, signature),
            ).to.be.revertedWith('!PERMIT_DEADLINE_EXPIRED!');
        });

        it('approved / approvedForAll accounts can create valid permits', async function () {
            // first send token to alice
            await contract.transferFrom(
                await deployer.getAddress(),
                await alice.getAddress(),
                1,
            );

            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // get a signature from deployer for bob
            // sign Permit for bob
            const signature = await sign(
                await bob.getAddress(),
                1,
                1,
                deadline,
            );

            // Bob tries to use signature, it should fail because deployer is not approved
            await expect(
                contract
                    .connect(bob)
                    .permit(await bob.getAddress(), 1, deadline, signature),
            ).to.be.revertedWith('!INVALID_PERMIT_SIGNATURE!');

            // alice approves deployer
            await contract
                .connect(alice)
                .setApprovalForAll(await deployer.getAddress(), true);

            // now usin the permit should work because deployer is approvedForAll on Alices tokens
            await contract
                .connect(bob)
                .permit(await bob.getAddress(), 1, deadline, signature);

            // bob should now be approved on tokenId one
            expect(await contract.getApproved(1)).to.be.equal(
                await bob.getAddress(),
            );
        });

        it('can use permit to get approved and transfer in the same tx (safeTransferwithPermit)', async function () {
            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // sign Permit for bob
            const signature = await sign(
                await bob.getAddress(),
                1,
                await contract.nonces(1),
                deadline,
            );

            expect(await contract.getApproved(1)).to.not.equal(
                await bob.getAddress(),
            );

            await contract
                .connect(bob)
                .safeTransferFromWithPermit(
                    await deployer.getAddress(),
                    await bob.getAddress(),
                    1,
                    [],
                    deadline,
                    signature,
                );

            expect(await contract.ownerOf(1)).to.be.equal(
                await bob.getAddress(),
            );
        });

        it('can not use permit to get approved and transfer in the same tx if wrong sender', async function () {
            // set deadline in 7 days
            const deadline = parseInt(+new Date() / 1000) + 7 * 24 * 60 * 60;

            // sign Permit for bob
            const signature = await sign(
                await bob.getAddress(),
                1,
                await contract.nonces(1),
                deadline,
            );

            // try to use permit for bob with Alice account, fails.
            await expect(
                contract
                    .connect(alice)
                    .safeTransferFromWithPermit(
                        await deployer.getAddress(),
                        await bob.getAddress(),
                        1,
                        [],
                        deadline,
                        signature,
                    ),
            ).to.be.revertedWith('!INVALID_PERMIT_SIGNATURE!');
        });
    });
});
